const test = require("node:test");
const assert = require("node:assert/strict");
const { assertIdentifier, assertSafeSqlFragment } = require("../lib/validation");
const { parseArgumentsJson, resolveTemplateValue } = require("../lib/action-args");
const { quoteIdent, normalizeFunctionBody, buildCreateFunctionSql, buildCreateProcedureSql, buildDropRoutineSql, validateCreateRoutineDdl } = require("../lib/sql-builders");

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
});

test("DB_Routine argument templates resolve from row and user context", () => {
  const context = { row: { id: 7, name: "Ada" }, user: { email: "ada@example.com" }, configuration: { source: "api" } };
  assert.equal(resolveTemplateValue("{{row.id}}", context), 7);
  assert.equal(resolveTemplateValue("User {{user.email}}", context), "User ada@example.com");
  assert.deepEqual(parseArgumentsJson('["{{row.id}}", "{{user.email}}", "{{configuration.source}}"]', context), [7, "ada@example.com", "api"]);
  assert.throws(() => parseArgumentsJson('{"id": "{{row.id}}"}', context), /array/);
});
