const db = require("@saltcorn/data/db");
const { requireAdmin } = require("../lib/auth");
const { escapeHtml, page } = require("../lib/html");
const { currentTenantSchema, ensurePostgres } = require("../lib/introspection");
const { buildCreateFunctionSql, buildCreateProcedureSql, validateCreateRoutineDdl } = require("../lib/sql-builders");
const { assertSafeSqlFragment } = require("../lib/validation");

function fieldValue(body, name, fallback = "") {
  return typeof body?.[name] === "undefined" ? fallback : body[name];
}

function csrfInput(req) {
  return typeof req.csrfToken === "function" ? `<input type="hidden" name="_csrf" value="${escapeHtml(req.csrfToken())}">` : "";
}

function selected(value, expected) {
  return value === expected ? " selected" : "";
}

function renderStructuredRoutineForm(req, routineType, values = {}, error = null) {
  const isProcedure = routineType === "procedure";
  const language = fieldValue(values, "language", "plpgsql");
  const volatility = fieldValue(values, "volatility", "VOLATILE");
  const security = fieldValue(values, "security", "INVOKER");
  const title = isProcedure ? "New stored procedure" : "New function";
  const action = isProcedure ? "/db-code/new-procedure" : "/db-code/new";
  return `<p><a href="/db-code">← Back to DB Code</a></p>
${error ? `<div class="alert alert-danger">${escapeHtml(error)}</div>` : ""}
<form method="post" action="${action}">
${csrfInput(req)}
<div class="mb-3">
  <label class="form-label">${isProcedure ? "Procedure" : "Function"} name</label>
  <input class="form-control" name="name" required pattern="[A-Za-z_][A-Za-z0-9_]*" value="${escapeHtml(fieldValue(values, "name"))}">
  <div class="form-text">Use only letters, numbers, and underscores. The tenant schema is selected automatically.</div>
</div>
<div class="mb-3">
  <label class="form-label">Arguments</label>
  <input class="form-control" name="argumentsSql" placeholder="user_id integer, active boolean" value="${escapeHtml(fieldValue(values, "argumentsSql"))}">
</div>
${isProcedure ? "" : `<div class="mb-3">
  <label class="form-label">Return type</label>
  <input class="form-control" name="returnType" required placeholder="integer, text, jsonb, setof table_name" value="${escapeHtml(fieldValue(values, "returnType"))}">
</div>`}
<div class="row">
  <div class="col-md-4 mb-3">
    <label class="form-label">Language</label>
    <select class="form-select" name="language">
      <option value="plpgsql"${selected(language, "plpgsql")}>plpgsql</option>
      <option value="sql"${selected(language, "sql")}>sql</option>
    </select>
  </div>
  ${isProcedure ? "" : `<div class="col-md-4 mb-3">
    <label class="form-label">Volatility</label>
    <select class="form-select" name="volatility">
      <option value="VOLATILE"${selected(volatility, "VOLATILE")}>VOLATILE</option>
      <option value="STABLE"${selected(volatility, "STABLE")}>STABLE</option>
      <option value="IMMUTABLE"${selected(volatility, "IMMUTABLE")}>IMMUTABLE</option>
    </select>
  </div>`}
  <div class="col-md-4 mb-3">
    <label class="form-label">Security</label>
    <select class="form-select" name="security">
      <option value="INVOKER"${selected(security, "INVOKER")}>INVOKER</option>
      <option value="DEFINER"${selected(security, "DEFINER")}>DEFINER</option>
    </select>
  </div>
</div>
<div class="mb-3">
  <label class="form-label">${isProcedure ? "Procedure" : "Function"} body</label>
  <textarea class="form-control to-code font-monospace" mode="text/x-sql" name="body" rows="12" required>${escapeHtml(fieldValue(values, "body"))}</textarea>
  <div class="form-text">Do not include CREATE ${isProcedure ? "PROCEDURE" : "FUNCTION"} or dollar-quote delimiters. For plpgsql, you may write a full BEGIN/END block or only statements; simple statement bodies are wrapped automatically.</div>
</div>
<div class="mb-3">
  <label class="form-label">Description</label>
  <input class="form-control" name="description" value="${escapeHtml(fieldValue(values, "description"))}">
</div>
<button class="btn btn-primary" type="submit">Create ${isProcedure ? "stored procedure" : "function"}</button>
</form>`;
}

function renderDdlForm(req, values = {}, error = null) {
  return `<p><a href="/db-code">← Back to DB Code</a></p>
${error ? `<div class="alert alert-danger">${escapeHtml(error)}</div>` : ""}
<div class="alert alert-warning">DDL mode executes administrator-provided SQL. The statement must create a function or procedure explicitly in the current tenant schema.</div>
<form method="post" action="/db-code/new-ddl">
${csrfInput(req)}
<div class="mb-3">
  <label class="form-label">CREATE FUNCTION / CREATE PROCEDURE DDL</label>
  <textarea class="form-control to-code font-monospace" mode="text/x-sql" name="ddl" rows="18" required>${escapeHtml(fieldValue(values, "ddl"))}</textarea>
</div>
<button class="btn btn-primary" type="submit">Create from DDL</button>
</form>`;
}

async function createFormRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  page(req, res, "New function", renderStructuredRoutineForm(req, "function"));
}

async function createProcedureFormRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  page(req, res, "New stored procedure", renderStructuredRoutineForm(req, "procedure"));
}

async function createDdlFormRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  page(req, res, "New from DDL", renderDdlForm(req));
}

async function createPostRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  const values = req.body || {};
  try {
    ensurePostgres();
    const argumentsSql = assertSafeSqlFragment(values.argumentsSql, "Arguments");
    const returnType = assertSafeSqlFragment(values.returnType, "Return type", { required: true });
    const sql = buildCreateFunctionSql({
      schema: currentTenantSchema(),
      name: values.name,
      argumentsSql,
      returnType,
      language: values.language || "plpgsql",
      volatility: values.volatility || "VOLATILE",
      security: values.security || "INVOKER",
      body: values.body || "",
      description: values.description || ""
    });
    await db.query(sql);
    if (typeof req.flash === "function") req.flash("success", `Function ${escapeHtml(values.name)} created`);
    res.redirect("/db-code?kind=function");
  } catch (error) {
    page(req, res, "New function", renderStructuredRoutineForm(req, "function", values, error.message));
  }
}

async function createProcedurePostRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  const values = req.body || {};
  try {
    ensurePostgres();
    const argumentsSql = assertSafeSqlFragment(values.argumentsSql, "Arguments");
    const sql = buildCreateProcedureSql({
      schema: currentTenantSchema(),
      name: values.name,
      argumentsSql,
      language: values.language || "plpgsql",
      security: values.security || "INVOKER",
      body: values.body || "",
      description: values.description || ""
    });
    await db.query(sql);
    if (typeof req.flash === "function") req.flash("success", `Stored procedure ${escapeHtml(values.name)} created`);
    res.redirect("/db-code?kind=procedure");
  } catch (error) {
    page(req, res, "New stored procedure", renderStructuredRoutineForm(req, "procedure", values, error.message));
  }
}

async function createDdlPostRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  const values = req.body || {};
  try {
    ensurePostgres();
    const ddl = validateCreateRoutineDdl(values.ddl, currentTenantSchema());
    await db.query(ddl);
    if (typeof req.flash === "function") req.flash("success", "Routine created from DDL");
    res.redirect("/db-code");
  } catch (error) {
    page(req, res, "New from DDL", renderDdlForm(req, values, error.message));
  }
}

module.exports = { createFormRoute, createPostRoute, createProcedureFormRoute, createProcedurePostRoute, createDdlFormRoute, createDdlPostRoute };
