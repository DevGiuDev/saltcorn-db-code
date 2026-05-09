const db = require("@saltcorn/data/db");
const { requireAdmin } = require("../lib/auth");
const { escapeHtml, page } = require("../lib/html");
const { currentTenantSchema, ensurePostgres } = require("../lib/introspection");
const { buildCreateFunctionSql, buildCreateProcedureSql, validateCreateRoutineDdl } = require("../lib/sql-builders");
const { assertSafeSqlFragment } = require("../lib/validation");
const { getState } = require("@saltcorn/data/db/state");

function fieldValue(body, name, fallback = "") {
  return typeof body?.[name] === "undefined" ? fallback : body[name];
}

function csrfInput(req) {
  return typeof req.csrfToken === "function" ? `<input type="hidden" name="_csrf" value="${escapeHtml(req.csrfToken())}">` : "";
}

function selected(value, expected) {
  return value === expected ? " selected" : "";
}

function formStyles() {
  return `<style>
.db-code-form .card-header { gap: .75rem; }
.db-code-form .db-code-form-icon { width: 2.25rem; height: 2.25rem; display: inline-flex; align-items: center; justify-content: center; }
.db-code-form .form-section-title { font-size: .78rem; letter-spacing: .06em; text-transform: uppercase; color: var(--bs-secondary-color, #6c757d); font-weight: 700; margin-bottom: .75rem; }
.db-code-form .sticky-help { position: sticky; top: 1rem; }
.db-code-form textarea.to-code + div, .db-code-form .monaco-editor { border-radius: .375rem; }
</style>`;
}

function shell({ title, subtitle, icon, backHref = "/db-code", backLabel = "Back to DB Code", error, aside, body }) {
  return `${formStyles()}<div class="db-code-form">
<p><a class="text-decoration-none" href="${backHref}"><i class="fas fa-arrow-left me-1"></i>${escapeHtml(backLabel)}</a></p>
${error ? `<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>${escapeHtml(error)}</div>` : ""}
<div class="card mt-0 card-max-full-screen">
  <div class="card-header d-flex justify-content-between align-items-center flex-wrap">
    <div class="d-flex align-items-center">
      <span class="db-code-form-icon rounded bg-primary text-white me-2"><i class="${icon}"></i></span>
      <div><h5 class="mb-0">${escapeHtml(title)}</h5><div class="small text-muted">${escapeHtml(subtitle)}</div></div>
    </div>
    <a class="btn btn-sm btn-outline-secondary" href="${backHref}">Cancel</a>
  </div>
  <div class="card-body">
    <div class="row g-4">
      <div class="col-lg-8">${body}</div>
      <div class="col-lg-4"><div class="sticky-help">${aside}</div></div>
    </div>
  </div>
</div>
</div>`;
}

function helpCard(items, warning = null) {
  return `<div class="card bg-light border-0"><div class="card-body">
<div class="form-section-title">Guidance</div>
${warning ? `<div class="alert alert-warning py-2 small">${warning}</div>` : ""}
<ul class="small mb-0">${items.map((item) => `<li>${item}</li>`).join("")}</ul>
</div></div>`;
}

function hasCopilot() {
  return !!getState()?.functions?.copilot_generate_javascript;
}

function aiModal(targetField, routineType) {
  return `<button class="btn btn-outline-secondary btn-sm mt-2" type="button" onclick="showDbCodeAiModal()"><i class="fas fa-wand-magic-sparkles me-1"></i>Edit with AI</button>
<div class="modal fade" id="dbCodeAiModal" tabindex="-1">
  <div class="modal-dialog"><div class="modal-content">
    <div class="modal-header"><h5 class="modal-title">Edit with AI</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <p class="text-muted small">Describe the ${routineType} you want to generate.</p>
      <textarea id="dbCodeAiPrompt" class="form-control" rows="4" placeholder="Create a ${routineType} that ..."></textarea>
      <div id="dbCodeAiError" class="alert alert-danger mt-2 mb-0 d-none"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button id="dbCodeAiGenBtn" class="btn btn-primary" onclick="runDbCodeAi()" disabled>Generate</button>
    </div>
  </div></div>
</div>
<script>
function showDbCodeAiModal(){ new bootstrap.Modal(document.getElementById('dbCodeAiModal')).show(); }
document.addEventListener('DOMContentLoaded', function(){ var ta=document.getElementById('dbCodeAiPrompt'); var btn=document.getElementById('dbCodeAiGenBtn'); if(ta&&btn) ta.addEventListener('input', function(){ btn.disabled=!ta.value.trim(); });});
function runDbCodeAi(){
  var ta=document.getElementById('dbCodeAiPrompt'); var prompt=ta.value.trim(); if(!prompt) return;
  var btn=document.getElementById('dbCodeAiGenBtn'); var err=document.getElementById('dbCodeAiError');
  btn.disabled=true; btn.textContent='Generating...'; err.classList.add('d-none');
  var edta=document.querySelector('textarea[name="${targetField}"]');
  var existing=edta?edta.value:'';
  fetch('/db-code/ai/generate-sql',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest','CSRF-Token':_sc_globalCsrf},body:JSON.stringify({description:prompt,existing_code:existing,routine_type:${JSON.stringify(routineType)}})})
    .then(r=>r.json()).then(data=>{
      btn.textContent='Generate';
      if(data.error){ err.textContent=data.error; err.classList.remove('d-none'); btn.disabled=!ta.value.trim(); return; }
      if(edta){ var m=edta.nextElementSibling; if(m){ var e=$(m).data('monaco-editor'); if(e) e.setValue(data.code); else edta.value=data.code; } else edta.value=data.code; }
      ta.value=''; btn.disabled=true; bootstrap.Modal.getInstance(document.getElementById('dbCodeAiModal')).hide();
    }).catch(e=>{ btn.textContent='Generate'; btn.disabled=!ta.value.trim(); err.textContent=e.message||'Generation failed'; err.classList.remove('d-none'); });
}
</script>`;
}

function renderStructuredRoutineForm(req, routineType, values = {}, error = null) {
  const isProcedure = routineType === "procedure";
  const language = fieldValue(values, "language", "plpgsql");
  const volatility = fieldValue(values, "volatility", "VOLATILE");
  const security = fieldValue(values, "security", "INVOKER");
  const title = isProcedure ? "New stored procedure" : "New function";
  const action = isProcedure ? "/db-code/new-procedure" : "/db-code/new";
  const objectLabel = isProcedure ? "stored procedure" : "function";
  const aside = helpCard([
    "The tenant schema is selected automatically and cannot be changed from the form.",
    "Use structured fields for safer routine creation. Use New from DDL only when you already trust the full SQL.",
    `For plpgsql, you may write a full BEGIN/END block or simple statements; simple bodies are wrapped automatically.`,
    isProcedure ? "Procedures are invoked with CALL and do not return a value directly." : "Functions are invoked with SELECT and require a return type."
  ]);
  const body = `<form method="post" action="${action}">
${csrfInput(req)}
<div class="form-section-title">Signature</div>
<div class="row g-3">
  <div class="col-md-6">
    <label class="form-label">${isProcedure ? "Procedure" : "Function"} name</label>
    <input class="form-control" name="name" required pattern="[A-Za-z_][A-Za-z0-9_]*" value="${escapeHtml(fieldValue(values, "name"))}" placeholder="my_${isProcedure ? "procedure" : "function"}">
    <div class="form-text">Letters, numbers, and underscores only.</div>
  </div>
  <div class="col-md-6">
    <label class="form-label">Arguments</label>
    <input class="form-control" name="argumentsSql" placeholder="user_id integer, active boolean" value="${escapeHtml(fieldValue(values, "argumentsSql"))}">
  </div>
  ${isProcedure ? "" : `<div class="col-md-6">
    <label class="form-label">Return type</label>
    <input class="form-control" name="returnType" required placeholder="integer, text, jsonb, setof table_name" value="${escapeHtml(fieldValue(values, "returnType"))}">
  </div>`}
</div>
<hr>
<div class="form-section-title">Execution properties</div>
<div class="row g-3">
  <div class="col-md-4">
    <label class="form-label">Language</label>
    <select class="form-select" name="language"><option value="plpgsql"${selected(language, "plpgsql")}>plpgsql</option><option value="sql"${selected(language, "sql")}>sql</option></select>
  </div>
  ${isProcedure ? "" : `<div class="col-md-4">
    <label class="form-label">Volatility</label>
    <select class="form-select" name="volatility"><option value="VOLATILE"${selected(volatility, "VOLATILE")}>VOLATILE</option><option value="STABLE"${selected(volatility, "STABLE")}>STABLE</option><option value="IMMUTABLE"${selected(volatility, "IMMUTABLE")}>IMMUTABLE</option></select>
  </div>`}
  <div class="col-md-4">
    <label class="form-label">Security</label>
    <select class="form-select" name="security"><option value="INVOKER"${selected(security, "INVOKER")}>INVOKER</option><option value="DEFINER"${selected(security, "DEFINER")}>DEFINER</option></select>
  </div>
</div>
<hr>
<div class="form-section-title">Code</div>
<div class="mb-3">
  <label class="form-label">${isProcedure ? "Procedure" : "Function"} body</label>
  <textarea class="form-control to-code font-monospace" mode="text/x-sql" name="body" rows="14" required>${escapeHtml(fieldValue(values, "body"))}</textarea>
  <div class="form-text">Do not include CREATE ${isProcedure ? "PROCEDURE" : "FUNCTION"} or dollar-quote delimiters.</div>
  ${hasCopilot() ? aiModal("body", isProcedure ? "stored procedure" : "function") : ""}
</div>
<div class="mb-3">
  <label class="form-label">Description</label>
  <input class="form-control" name="description" value="${escapeHtml(fieldValue(values, "description"))}" placeholder="Optional routine description">
</div>
<div class="d-flex gap-2"><button class="btn btn-primary" type="submit"><i class="fas fa-save me-1"></i>Create ${objectLabel}</button><a class="btn btn-outline-secondary" href="/db-code">Cancel</a></div>
</form>`;
  return shell({ title, subtitle: `Create a PostgreSQL ${objectLabel} in the current tenant schema`, icon: isProcedure ? "fas fa-cogs" : "fas fa-cube", error, aside, body });
}

function renderDdlForm(req, values = {}, error = null) {
  const aside = helpCard([
    "DDL mode is intended for trusted SQL you already have.",
    "The statement must start with CREATE FUNCTION or CREATE PROCEDURE.",
    "The routine must be created explicitly in the current tenant schema.",
    "Use structured forms when possible; they apply stronger validation."
  ], "DDL mode executes administrator-provided SQL.");
  const body = `<form method="post" action="/db-code/new-ddl">
${csrfInput(req)}
<div class="form-section-title">Full DDL</div>
<div class="mb-3">
  <label class="form-label">CREATE FUNCTION / CREATE PROCEDURE DDL</label>
  <textarea class="form-control to-code font-monospace" mode="text/x-sql" name="ddl" rows="22" required>${escapeHtml(fieldValue(values, "ddl"))}</textarea>
  ${hasCopilot() ? aiModal("ddl", "function or stored procedure") : ""}
</div>
<div class="d-flex gap-2"><button class="btn btn-primary" type="submit"><i class="fas fa-file-code me-1"></i>Create from DDL</button><a class="btn btn-outline-secondary" href="/db-code">Cancel</a></div>
</form>`;
  return shell({ title: "New from DDL", subtitle: "Create a function or stored procedure from full PostgreSQL DDL", icon: "fas fa-file-code", error, aside, body });
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
    const sql = buildCreateFunctionSql({ schema: currentTenantSchema(), name: values.name, argumentsSql, returnType, language: values.language || "plpgsql", volatility: values.volatility || "VOLATILE", security: values.security || "INVOKER", body: values.body || "", description: values.description || "" });
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
    const sql = buildCreateProcedureSql({ schema: currentTenantSchema(), name: values.name, argumentsSql, language: values.language || "plpgsql", security: values.security || "INVOKER", body: values.body || "", description: values.description || "" });
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
