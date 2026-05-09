const db = require("@saltcorn/data/db");
const { requireAdmin } = require("../lib/auth");
const { escapeHtml, page } = require("../lib/html");
const { currentTenantSchema, ensurePostgres, getRoutineByOid } = require("../lib/introspection");
const { validateCreateRoutineDdl } = require("../lib/sql-builders");
const { getState } = require("@saltcorn/data/db/state");
const { detailViewHref, listViewHref, viewContextInput, getViewBaseUrl } = require("../lib/view-context");

function csrfInput(req) {
  return typeof req.csrfToken === "function" ? `<input type="hidden" name="_csrf" value="${escapeHtml(req.csrfToken())}">` : "";
}

function formStyles() {
  return `<style>
.db-code-form .card-header { gap: .75rem; }
.db-code-form .db-code-form-icon { width: 2.25rem; height: 2.25rem; display: inline-flex; align-items: center; justify-content: center; }
.db-code-form .form-section-title { font-size: .78rem; letter-spacing: .06em; text-transform: uppercase; color: var(--bs-secondary-color, #6c757d); font-weight: 700; margin-bottom: .75rem; }
.db-code-form .sticky-help { position: sticky; top: 1rem; }
</style>`;
}

function helpCard(routine) {
  return `<div class="card bg-light border-0"><div class="card-body">
<div class="form-section-title">Routine identity</div>
<table class="table table-sm mb-3">
<tr><th>Name</th><td><code>${escapeHtml(routine.schema)}.${escapeHtml(routine.name)}</code></td></tr>
<tr><th>Type</th><td>${escapeHtml(routine.kind)}</td></tr>
<tr><th>Arguments</th><td><code>${escapeHtml(routine.identity_arguments || "")}</code></td></tr>
<tr><th>Language</th><td>${escapeHtml(routine.language || "")}</td></tr>
</table>
<div class="alert alert-warning py-2 small">Editing runs the DDL below. Keep the same routine identity unless you intentionally want PostgreSQL to create a different overload.</div>
<ul class="small mb-0">
<li>Changing a function return type may require dropping and recreating it.</li>
<li>The edited DDL must target the current tenant schema.</li>
<li>Use CREATE OR REPLACE for safer iterative edits.</li>
</ul>
</div></div>`;
}

function hasCopilot() {
  return !!getState()?.functions?.copilot_generate_javascript;
}

function aiModal(routineType) {
  return `<button class="btn btn-outline-secondary btn-sm mt-2" type="button" onclick="showDbCodeAiModal()"><i class="fas fa-wand-magic-sparkles me-1"></i>Edit with AI</button>
<div class="modal fade" id="dbCodeAiModal" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
<div class="modal-header"><h5 class="modal-title">Edit with AI</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
<div class="modal-body"><p class="text-muted small">Describe the changes to apply to this ${routineType}.</p><textarea id="dbCodeAiPrompt" class="form-control" rows="4"></textarea><div id="dbCodeAiError" class="alert alert-danger mt-2 mb-0 d-none"></div></div>
<div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button id="dbCodeAiGenBtn" class="btn btn-primary" onclick="runDbCodeAi()" disabled>Generate</button></div>
</div></div></div>
<script>
function showDbCodeAiModal(){ new bootstrap.Modal(document.getElementById('dbCodeAiModal')).show(); }
document.addEventListener('DOMContentLoaded', function(){ var ta=document.getElementById('dbCodeAiPrompt'); var btn=document.getElementById('dbCodeAiGenBtn'); if(ta&&btn) ta.addEventListener('input', function(){ btn.disabled=!ta.value.trim(); });});
function runDbCodeAi(){ var ta=document.getElementById('dbCodeAiPrompt'); var prompt=ta.value.trim(); if(!prompt) return; var btn=document.getElementById('dbCodeAiGenBtn'); var err=document.getElementById('dbCodeAiError'); btn.disabled=true; btn.textContent='Generating...'; err.classList.add('d-none'); var edta=document.querySelector('textarea[name="ddl"]'); var existing=edta?edta.value:''; fetch('/db-code/ai/generate-sql',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest','CSRF-Token':_sc_globalCsrf},body:JSON.stringify({description:prompt,existing_code:existing,routine_type:${JSON.stringify(routineType)}})}).then(r=>r.json()).then(data=>{ btn.textContent='Generate'; if(data.error){ err.textContent=data.error; err.classList.remove('d-none'); btn.disabled=!ta.value.trim(); return; } if(edta){ var m=edta.nextElementSibling; if(m){ var e=$(m).data('monaco-editor'); if(e) e.setValue(data.code); else edta.value=data.code; } else edta.value=data.code; } ta.value=''; btn.disabled=true; bootstrap.Modal.getInstance(document.getElementById('dbCodeAiModal')).hide(); }).catch(e=>{ btn.textContent='Generate'; btn.disabled=!ta.value.trim(); err.textContent=e.message||'Generation failed'; err.classList.remove('d-none'); }); }
</script>`;
}

function renderEditForm(req, routine, values = {}, error = null, viewBaseUrl = null) {
  const ddl = typeof values.ddl === "undefined" ? routine.definition : values.ddl;
  const icon = routine.kind === "procedure" ? "fas fa-cogs" : "fas fa-cube";
  const backHref = detailViewHref(viewBaseUrl, routine.oid);
  return `${formStyles()}<div class="db-code-form">
<p><a class="text-decoration-none" href="${backHref}"><i class="fas fa-arrow-left me-1"></i>Back to routine</a></p>
${error ? `<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>${escapeHtml(error)}</div>` : ""}
<div class="card mt-0 card-max-full-screen">
  <div class="card-header d-flex justify-content-between align-items-center flex-wrap">
    <div class="d-flex align-items-center">
      <span class="db-code-form-icon rounded bg-primary text-white me-2"><i class="${icon}"></i></span>
      <div><h5 class="mb-0">Edit ${escapeHtml(routine.kind)}: ${escapeHtml(routine.name)}</h5><div class="small text-muted">Modify the PostgreSQL DDL for this routine</div></div>
    </div>
    <a class="btn btn-sm btn-outline-secondary" href="${backHref}">Cancel</a>
  </div>
  <div class="card-body">
    <div class="row g-4">
      <div class="col-lg-8">
        <form method="post" action="/db-code/routine/${routine.oid}/edit">
          ${csrfInput(req)}
          ${viewContextInput(viewBaseUrl)}
          <div class="form-section-title">Routine DDL</div>
          <div class="mb-3">
            <textarea class="form-control to-code font-monospace" mode="text/x-sql" name="ddl" rows="24" required>${escapeHtml(ddl)}</textarea>
            ${hasCopilot() ? aiModal(routine.kind) : ""}
          </div>
          <div class="d-flex gap-2"><button class="btn btn-primary" type="submit"><i class="fas fa-save me-1"></i>Save routine</button><a class="btn btn-outline-secondary" href="${backHref}">Cancel</a></div>
        </form>
      </div>
      <div class="col-lg-4"><div class="sticky-help">${helpCard(routine)}</div></div>
    </div>
  </div>
</div>
</div>`;
}

async function editFormRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    ensurePostgres();
    const routine = await getRoutineByOid(req.params.oid);
    if (!routine) {
      if (typeof res.status === "function") res.status(404);
      return page(req, res, "Routine not found", `<div class="alert alert-warning">Routine not found in the current tenant schema.</div>`);
    }
    page(req, res, `Edit ${routine.kind}: ${routine.name}`, renderEditForm(req, routine, {}, null, getViewBaseUrl(req)));
  } catch (error) {
    page(req, res, "Edit routine", `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`);
  }
}

async function editPostRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  const values = req.body || {};
  const viewBaseUrl = getViewBaseUrl(req);
  try {
    ensurePostgres();
    const routine = await getRoutineByOid(req.params.oid);
    if (!routine) {
      if (typeof res.status === "function") res.status(404);
      return page(req, res, "Routine not found", `<div class="alert alert-warning">Routine not found in the current tenant schema.</div>`);
    }
    const ddl = validateCreateRoutineDdl(values.ddl, currentTenantSchema());
    await db.query(ddl);
    if (typeof req.flash === "function") req.flash("success", `Routine ${escapeHtml(routine.name)} saved`);
    res.redirect(detailViewHref(viewBaseUrl, routine.oid));
  } catch (error) {
    const routine = await getRoutineByOid(req.params.oid).catch(() => null);
    if (routine) page(req, res, `Edit ${routine.kind}: ${routine.name}`, renderEditForm(req, routine, values, error.message, viewBaseUrl));
    else page(req, res, "Edit routine", `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`);
  }
}

module.exports = { editFormRoute, editPostRoute };
