const { assertIdentifier, assertAllowed, ALLOWED_LANGUAGES, ALLOWED_VOLATILITY, ALLOWED_SECURITY } = require("./validation");

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasExactlyOneTopLevelTerminatedStatement(sql) {
  const text = String(sql || "");
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag = null;
  let semicolonCount = 0;

  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      i += 1;
      continue;
    }

    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (dollarTag) {
      if (text.startsWith(dollarTag, i)) {
        i += dollarTag.length;
        dollarTag = null;
      } else {
        i += 1;
      }
      continue;
    }

    if (inSingle) {
      if (c === "'" && next === "'") {
        i += 2;
      } else if (c === "'") {
        inSingle = false;
        i += 1;
      } else {
        i += 1;
      }
      continue;
    }

    if (inDouble) {
      if (c === '"' && next === '"') {
        i += 2;
      } else if (c === '"') {
        inDouble = false;
        i += 1;
      } else {
        i += 1;
      }
      continue;
    }

    if (c === "-" && next === "-") {
      inLineComment = true;
      i += 2;
      continue;
    }

    if (c === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }

    if (c === "$") {
      const match = text.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        i += dollarTag.length;
        continue;
      }
    }

    if (c === "'") {
      inSingle = true;
      i += 1;
      continue;
    }

    if (c === '"') {
      inDouble = true;
      i += 1;
      continue;
    }

    if (c === ";") semicolonCount += 1;
    i += 1;
  }

  if (inSingle || inDouble || inBlockComment || inLineComment || dollarTag) return false;
  if (semicolonCount !== 1) return false;

  const trimmed = text.trim();
  if (!trimmed.endsWith(";")) return false;
  return true;
}

function quoteIdent(identifier) {
  assertIdentifier(identifier);
  return `"${identifier.replace(/"/g, '""')}"`;
}

function normalizeRoutineBody(body, language) {
  const text = String(body || "").trim();
  if (language !== "plpgsql" || /^\s*(BEGIN|DECLARE)\b/i.test(text)) return text;
  const bodyWithSemicolon = /;\s*$/.test(text) ? text : `${text};`;
  return `BEGIN\n  ${bodyWithSemicolon}\nEND`;
}

function dollarQuote(body) {
  const tag = "$scdbcode$";
  if (String(body || "").includes(tag)) throw new Error("Routine body cannot contain the $scdbcode$ delimiter.");
  return `${tag}\n${body || ""}\n${tag}`;
}

function buildCreateFunctionSql({ schema, name, argumentsSql = "", returnType, language = "plpgsql", volatility = "VOLATILE", security = "INVOKER", body = "", description }) {
  assertIdentifier(schema, "schema");
  assertIdentifier(name, "function name");
  assertAllowed(language, ALLOWED_LANGUAGES, "language");
  assertAllowed(volatility, ALLOWED_VOLATILITY, "volatility");
  assertAllowed(security, ALLOWED_SECURITY, "security");
  if (!String(returnType || "").trim()) throw new Error("Return type is required.");

  const normalizedBody = normalizeRoutineBody(body, language);
  const createSql = `CREATE OR REPLACE FUNCTION ${quoteIdent(schema)}.${quoteIdent(name)}(${argumentsSql || ""})\nRETURNS ${returnType}\nLANGUAGE ${language}\n${volatility}\nSECURITY ${security}\nAS ${dollarQuote(normalizedBody)};`;
  if (!description) return createSql;
  return `${createSql}\n\nCOMMENT ON FUNCTION ${quoteIdent(schema)}.${quoteIdent(name)}(${argumentsSql || ""}) IS ${literal(description)};`;
}

function buildCreateProcedureSql({ schema, name, argumentsSql = "", language = "plpgsql", security = "INVOKER", body = "", description }) {
  assertIdentifier(schema, "schema");
  assertIdentifier(name, "procedure name");
  assertAllowed(language, ALLOWED_LANGUAGES, "language");
  assertAllowed(security, ALLOWED_SECURITY, "security");

  const normalizedBody = normalizeRoutineBody(body, language);
  const createSql = `CREATE OR REPLACE PROCEDURE ${quoteIdent(schema)}.${quoteIdent(name)}(${argumentsSql || ""})\nLANGUAGE ${language}\nSECURITY ${security}\nAS ${dollarQuote(normalizedBody)};`;
  if (!description) return createSql;
  return `${createSql}\n\nCOMMENT ON PROCEDURE ${quoteIdent(schema)}.${quoteIdent(name)}(${argumentsSql || ""}) IS ${literal(description)};`;
}

function buildDropRoutineSql({ schema, name, identityArguments = "", kind = "function" }) {
  assertIdentifier(schema, "schema");
  assertIdentifier(name, "routine name");
  const command = kind === "procedure" ? "DROP PROCEDURE" : "DROP FUNCTION";
  return `${command} ${quoteIdent(schema)}.${quoteIdent(name)}(${identityArguments || ""});`;
}

function validateCreateRoutineDdl(sql, schema) {
  const ddl = String(sql || "").trim();
  if (!ddl) throw new Error("DDL is required.");
  assertIdentifier(schema, "schema");
  if (!hasExactlyOneTopLevelTerminatedStatement(ddl)) {
    throw new Error("DDL must contain exactly one CREATE FUNCTION/PROCEDURE statement terminated by a single top-level semicolon.");
  }
  if (!/^CREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|PROCEDURE)\s+/i.test(ddl)) {
    throw new Error("DDL must start with CREATE FUNCTION, CREATE OR REPLACE FUNCTION, CREATE PROCEDURE, or CREATE OR REPLACE PROCEDURE.");
  }
  const schemaPattern = new RegExp(`^CREATE\\s+(OR\\s+REPLACE\\s+)?(FUNCTION|PROCEDURE)\\s+("${escapeRegex(schema)}"|${escapeRegex(schema)})\\s*\\.`, "i");
  if (!schemaPattern.test(ddl)) throw new Error(`DDL must create the routine explicitly in the current tenant schema: ${schema}.`);
  return ddl;
}

function literal(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

module.exports = { quoteIdent, normalizeRoutineBody, normalizeFunctionBody: normalizeRoutineBody, buildCreateFunctionSql, buildCreateProcedureSql, buildDropRoutineSql, validateCreateRoutineDdl };
