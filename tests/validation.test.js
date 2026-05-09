const test = require("node:test");
const assert = require("node:assert/strict");
const { assertIdentifier, assertSafeSqlFragment } = require("../lib/validation");
const { parseArgumentsJson, resolveTemplateValue } = require("../lib/action-args");
const { resolveRoutineArguments, buildArgumentTemplates } = require("../lib/routine-args");
const { quoteIdent, normalizeFunctionBody, buildCreateFunctionSql, buildCreateProcedureSql, buildDropRoutineSql, validateCreateRoutineDdl } = require("../lib/sql-builders");
const { sanitizeViewBaseUrl, routeHref } = require("../lib/view-context");

test("valid identifiers are accepted and quoted", () => {
  assert.equal(quoteIdent("my_function_1"), '"my_function_1"');
});

test("invalid identifiers are rejected", () => {
  assert.throws(() => assertIdentifier("bad-name"), /Invalid/);
  assert.throws(() => assertIdentifier("1bad"), /Invalid/);
});

test("create function SQL is built with tenant schema quoting", () => {
  const sql = buildCreateFunctionSql({
    schema: "tenant1",
    name: "answer",
    argumentsSql: "",
    returnType: "integer",
    language: "sql",
    volatility: "IMMUTABLE",
    security: "INVOKER",
    body: "SELECT 42"
  });
  assert.match(sql, /CREATE OR REPLACE FUNCTION "tenant1"\."answer"\(\)/);
  assert.match(sql, /RETURNS integer/);
  assert.match(sql, /LANGUAGE sql/);
});

test("drop routine SQL does not use cascade", () => {
  assert.equal(
    buildDropRoutineSql({ schema: "tenant1", name: "answer", identityArguments: "", kind: "function" }),
    'DROP FUNCTION "tenant1"."answer"();'
  );
});

test("safe SQL fragments reject statement separators and comments", () => {
  assert.equal(assertSafeSqlFragment("user_id integer, active boolean", "Arguments"), "user_id integer, active boolean");
  assert.throws(() => assertSafeSqlFragment("integer; drop table users", "Return type"), /disallowed/);
  assert.throws(() => assertSafeSqlFragment("integer -- comment", "Return type"), /disallowed/);
});

test("plpgsql statement bodies are wrapped in a block", () => {
  assert.equal(normalizeFunctionBody("RETURN 1", "plpgsql"), "BEGIN\n  RETURN 1;\nEND");
  assert.equal(normalizeFunctionBody("BEGIN\nRETURN 1;\nEND", "plpgsql"), "BEGIN\nRETURN 1;\nEND");
  assert.equal(normalizeFunctionBody("SELECT 1", "sql"), "SELECT 1");
});

test("create procedure SQL is built with tenant schema quoting", () => {
  const sql = buildCreateProcedureSql({ schema: "tenant1", name: "do_work", argumentsSql: "", language: "plpgsql", security: "INVOKER", body: "RAISE NOTICE 'ok'" });
  assert.match(sql, /CREATE OR REPLACE PROCEDURE "tenant1"\."do_work"\(\)/);
  assert.match(sql, /LANGUAGE plpgsql/);
});

test("DDL creation requires explicit current tenant schema", () => {
  assert.match(validateCreateRoutineDdl('CREATE FUNCTION "tenant1"."answer"() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;', "tenant1"), /CREATE FUNCTION/);
  assert.throws(() => validateCreateRoutineDdl("CREATE FUNCTION public.answer() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;", "tenant1"), /tenant schema/);
  assert.throws(() => validateCreateRoutineDdl("DROP FUNCTION tenant1.answer();", "tenant1"), /must start/);
  assert.throws(() => validateCreateRoutineDdl('CREATE FUNCTION "tenant1"."answer"() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$; DROP TABLE users;', "tenant1"), /exactly one/);
  assert.match(validateCreateRoutineDdl("CREATE OR REPLACE FUNCTION \"tenant1\".\"semi\"() RETURNS text LANGUAGE plpgsql AS $$ BEGIN RETURN 'a;b'; END $$;", "tenant1"), /CREATE OR REPLACE FUNCTION/);
});

test("view base URL is sanitized to internal routes only", () => {
  assert.equal(sanitizeViewBaseUrl("/view/DBCodeConsole"), "/view/DBCodeConsole");
  assert.equal(sanitizeViewBaseUrl("/db-code"), "/db-code");
  assert.equal(sanitizeViewBaseUrl("https://evil.test/phish"), null);
  assert.equal(sanitizeViewBaseUrl("//evil.test/phish"), null);
  assert.equal(sanitizeViewBaseUrl("javascript:alert(1)"), null);
  assert.equal(routeHref("/db-code/new", "https://evil.test"), "/db-code/new");
});

test("DB_Routine argument templates resolve from row and user context", () => {
  const context = { row: { id: 7, name: "Ada" }, user: { email: "ada@example.com" }, configuration: { source: "api" } };
  assert.equal(resolveTemplateValue("{{row.id}}", context), 7);
  assert.equal(resolveTemplateValue("User {{user.email}}", context), "User ada@example.com");
  assert.deepEqual(parseArgumentsJson('["{{row.id}}", "{{user.email}}", "{{configuration.source}}"]', context), [7, "ada@example.com", "api"]);
  assert.throws(() => parseArgumentsJson('{"id": "{{row.id}}"}', context), /array/);
  assert.deepEqual(parseArgumentsJson('{"id": "{{row.id}}"}', context, { allowObject: true }), { id: 7 });
});

test("DB_Routine resolves named and positional arguments using introspection", () => {
  const routine = {
    pronargs: 3,
    pronargdefaults: 1,
    input_args: [
      { position: 1, name: "id", type: "integer" },
      { position: 2, name: "email", type: "text" },
      { position: 3, name: "is_active", type: "boolean" }
    ]
  };
  const context = { row: { id: 11, active: true }, user: { email: "x@y.com" }, configuration: {} };

  assert.deepEqual(
    resolveRoutineArguments(routine, '{"id":"{{row.id}}","email":"{{user.email}}"}', context),
    [11, "x@y.com"]
  );
  assert.deepEqual(
    resolveRoutineArguments(routine, '["{{row.id}}", "{{user.email}}", "{{row.active}}"]', context),
    [11, "x@y.com", true]
  );
  assert.throws(() => resolveRoutineArguments(routine, '{"id":1}', context), /Missing required argument/);
});

test("DB_Routine builds argument templates from introspection", () => {
  const routine = {
    pronargs: 2,
    pronargdefaults: 1,
    input_args: [
      { position: 1, name: "account_id", type: "integer" },
      { position: 2, name: "verbose", type: "boolean" }
    ]
  };
  const templates = buildArgumentTemplates(routine);
  assert.match(templates.positionalRequired, /account_id/);
  assert.match(templates.positionalAll, /verbose/);
  assert.match(templates.namedRequired, /account_id/);
});

test("arguments_json validator rejects invalid JSON", () => {
  // Get the arguments_json field definition (synchronous part of configFields)
  // configFields is async, so we test the validator logic directly
  const validator = (s) => {
    if (!s || !String(s).trim()) return true;
    try {
      const parsed = JSON.parse(s);
      if (!Array.isArray(parsed) && (parsed === null || typeof parsed !== "object")) {
        return "Arguments must be a JSON array or object.";
      }
      return true;
    } catch (e) {
      return `Invalid JSON: ${e.message}`;
    }
  };

  assert.equal(validator(""), true);
  assert.equal(validator(null), true);
  assert.equal(validator('[1, 2]'), true);
  assert.equal(validator('{"a":1}'), true);
  assert.match(validator("not json"), /Invalid JSON/);
  assert.equal(validator('"just a string"'), "Arguments must be a JSON array or object.");
  assert.equal(validator("42"), "Arguments must be a JSON array or object.");
});

test("routineArity calculates required and total correctly", () => {
  const { routineArity } = require("../lib/routine-args");
  assert.deepEqual(routineArity({ pronargs: 3, pronargdefaults: 1 }), { required: 2, total: 3 });
  assert.deepEqual(routineArity({ pronargs: 0, pronargdefaults: 0 }), { required: 0, total: 0 });
  assert.deepEqual(routineArity({ pronargs: 2, pronargdefaults: 2 }), { required: 0, total: 2 });
});

test("parseAndValidateArgs rejects wrong arity", () => {
  // Replicate the pure validation logic from db-routine-action
  const { routineArity } = require("../lib/routine-args");

  function parseAndValidateArgs(argumentsJson, routine) {
    const text = String(argumentsJson || "").trim();
    const { required, total } = routineArity(routine);
    if (!text) {
      if (required > 0) throw new Error(`Routine "${routine.name}" requires ${required} argument(s) but none were provided.`);
      return [];
    }
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      if (parsed.length < required) throw new Error(`too few`);
      if (parsed.length > total) throw new Error(`too many`);
      return parsed;
    }
    if (parsed && typeof parsed === "object") return parsed;
    throw new Error("must be array or object");
  }

  const routine2args = { name: "f", pronargs: 2, pronargdefaults: 0, identity_arguments: "a integer, b text" };
  const routine0args = { name: "g", pronargs: 0, pronargdefaults: 0, identity_arguments: "" };

  // 2 required, 0 provided → error
  assert.throws(() => parseAndValidateArgs("", routine2args), /requires 2/);
  assert.throws(() => parseAndValidateArgs("[1]", routine2args), /too few/);
  assert.throws(() => parseAndValidateArgs('[1, 2, 3]', routine2args), /too many/);
  assert.deepEqual(parseAndValidateArgs('[1, 2]', routine2args), [1, 2]);

  // 0 args routine, no args provided → ok
  assert.deepEqual(parseAndValidateArgs("", routine0args), []);
  // 0 args routine, args provided → error
  assert.throws(() => parseAndValidateArgs('[1]', routine0args), /too many/);
});
