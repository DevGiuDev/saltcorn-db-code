const test = require("node:test");
const assert = require("node:assert/strict");
const { assertIdentifier } = require("../lib/validation");
const { quoteIdent, buildCreateFunctionSql, buildDropRoutineSql } = require("../lib/sql-builders");

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
