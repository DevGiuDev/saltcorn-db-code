const { assertIdentifier, assertAllowed, ALLOWED_LANGUAGES, ALLOWED_VOLATILITY, ALLOWED_SECURITY } = require("./validation");

function quoteIdent(identifier) {
  assertIdentifier(identifier);
  return `"${identifier.replace(/"/g, '""')}"`;
}

function dollarQuote(body) {
  const tag = "$scdbcode$";
  if (String(body || "").includes(tag)) throw new Error("Function body cannot contain the $scdbcode$ delimiter.");
  return `${tag}\n${body || ""}\n${tag}`;
}

function buildCreateFunctionSql({ schema, name, argumentsSql = "", returnType, language = "plpgsql", volatility = "VOLATILE", security = "INVOKER", body = "", description }) {
  assertIdentifier(schema, "schema");
  assertIdentifier(name, "function name");
  assertAllowed(language, ALLOWED_LANGUAGES, "language");
  assertAllowed(volatility, ALLOWED_VOLATILITY, "volatility");
  assertAllowed(security, ALLOWED_SECURITY, "security");
  if (!String(returnType || "").trim()) throw new Error("Return type is required.");

  const createSql = `CREATE OR REPLACE FUNCTION ${quoteIdent(schema)}.${quoteIdent(name)}(${argumentsSql || ""})\nRETURNS ${returnType}\nLANGUAGE ${language}\n${volatility}\nSECURITY ${security}\nAS ${dollarQuote(body)};`;
  if (!description) return createSql;
  return `${createSql}\n\nCOMMENT ON FUNCTION ${quoteIdent(schema)}.${quoteIdent(name)}(${argumentsSql || ""}) IS ${literal(description)};`;
}

function buildDropRoutineSql({ schema, name, identityArguments = "", kind = "function" }) {
  assertIdentifier(schema, "schema");
  assertIdentifier(name, "routine name");
  const command = kind === "procedure" ? "DROP PROCEDURE" : "DROP FUNCTION";
  return `${command} ${quoteIdent(schema)}.${quoteIdent(name)}(${identityArguments || ""});`;
}

function literal(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

module.exports = { quoteIdent, buildCreateFunctionSql, buildDropRoutineSql };
