const db = require("@saltcorn/data/db");
const { requireAdmin } = require("../lib/auth");
const { escapeHtml, page } = require("../lib/html");
const { currentTenantSchema, ensurePostgres } = require("../lib/introspection");
const { buildCreateFunctionSql } = require("../lib/sql-builders");
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

function renderCreateForm(req, values = {}, error = null) {
  const language = fieldValue(values, "language", "plpgsql");
  const volatility = fieldValue(values, "volatility", "VOLATILE");
  const security = fieldValue(values, "security", "INVOKER");
  return `<p><a href="/db-code">← Back to DB Code</a></p>
${error ? `<div class="alert alert-danger">${escapeHtml(error)}</div>` : ""}
<form method="post" action="/db-code/new">
${csrfInput(req)}
<div class="mb-3">
  <label class="form-label">Function name</label>
  <input class="form-control" name="name" required pattern="[A-Za-z_][A-Za-z0-9_]*" value="${escapeHtml(fieldValue(values, "name"))}">
  <div class="form-text">Use only letters, numbers, and underscores. The tenant schema is selected automatically.</div>
</div>
<div class="mb-3">
  <label class="form-label">Arguments</label>
  <input class="form-control" name="argumentsSql" placeholder="user_id integer, active boolean" value="${escapeHtml(fieldValue(values, "argumentsSql"))}">
</div>
<div class="mb-3">
  <label class="form-label">Return type</label>
  <input class="form-control" name="returnType" required placeholder="integer, text, jsonb, setof table_name" value="${escapeHtml(fieldValue(values, "returnType"))}">
</div>
<div class="row">
  <div class="col-md-4 mb-3">
    <label class="form-label">Language</label>
    <select class="form-select" name="language">
      <option value="plpgsql"${selected(language, "plpgsql")}>plpgsql</option>
      <option value="sql"${selected(language, "sql")}>sql</option>
    </select>
  </div>
  <div class="col-md-4 mb-3">
    <label class="form-label">Volatility</label>
    <select class="form-select" name="volatility">
      <option value="VOLATILE"${selected(volatility, "VOLATILE")}>VOLATILE</option>
      <option value="STABLE"${selected(volatility, "STABLE")}>STABLE</option>
      <option value="IMMUTABLE"${selected(volatility, "IMMUTABLE")}>IMMUTABLE</option>
    </select>
  </div>
  <div class="col-md-4 mb-3">
    <label class="form-label">Security</label>
    <select class="form-select" name="security">
      <option value="INVOKER"${selected(security, "INVOKER")}>INVOKER</option>
      <option value="DEFINER"${selected(security, "DEFINER")}>DEFINER</option>
    </select>
  </div>
</div>
<div class="mb-3">
  <label class="form-label">Function body</label>
  <textarea class="form-control to-code font-monospace" mode="text/x-sql" name="body" rows="12" required>${escapeHtml(fieldValue(values, "body"))}</textarea>
  <div class="form-text">Do not include CREATE FUNCTION or dollar-quote delimiters. For plpgsql, you may write a full BEGIN/END block or only statements such as <code>RETURN 1;</code>; simple statement bodies are wrapped automatically.</div>
</div>
<div class="mb-3">
  <label class="form-label">Description</label>
  <input class="form-control" name="description" value="${escapeHtml(fieldValue(values, "description"))}">
</div>
<button class="btn btn-primary" type="submit">Create function</button>
</form>`;
}

async function createFormRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  page(req, res, "New function", renderCreateForm(req));
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
    res.redirect("/db-code");
  } catch (error) {
    page(req, res, "New function", renderCreateForm(req, values, error.message));
  }
}

module.exports = { createFormRoute, createPostRoute };
