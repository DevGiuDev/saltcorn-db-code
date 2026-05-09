const { escapeHtml } = require("./html");
const { listRoutines, getRoutineByOid } = require("./introspection");
const { listViewHref, detailViewHref, routeHref, viewContextInput } = require("./view-context");

const KIND_OPTIONS = [
  { value: "", label: "All", icon: "fas fa-code" },
  { value: "function", label: "Functions", icon: "fas fa-cube" },
  { value: "procedure", label: "Stored procedures", icon: "fas fa-cogs" }
];

function unsupportedHtml(error) {
  return `<div class="alert alert-warning">${escapeHtml(error.message || error)}</div>`;
}

function filterUrl(baseUrl, kind, viewBaseUrl) {
  if (viewBaseUrl) return listViewHref(viewBaseUrl, kind);
  const suffix = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  return `${baseUrl}${suffix}`;
}

function kindBadge(kind) {
  const cfg = kind === "procedure"
    ? { klass: "bg-warning text-dark", icon: "fas fa-cogs", label: "Stored procedure" }
    : { klass: "bg-primary", icon: "fas fa-cube", label: "Function" };
  return `<span class="badge ${cfg.klass}"><i class="${cfg.icon} me-1"></i>${cfg.label}</span>`;
}

function volatilityBadge(volatility) {
  if (!volatility) return "";
  const klass = volatility === "IMMUTABLE" ? "bg-success" : volatility === "STABLE" ? "bg-info text-dark" : "bg-secondary";
  return `<span class="badge ${klass} me-1">${escapeHtml(volatility)}</span>`;
}

async function renderRoutineList({ baseUrl = "/db-code", useViewState = false, showWriteActions = true, kind = "" } = {}) {
  const viewBaseUrl = useViewState ? baseUrl : null;
  try {
    const allRoutines = await listRoutines();
    const selectedKind = ["function", "procedure"].includes(kind) ? kind : "";
    const routines = selectedKind ? allRoutines.filter((routine) => routine.kind === selectedKind) : allRoutines;
    const functionCount = allRoutines.filter((routine) => routine.kind === "function").length;
    const procedureCount = allRoutines.filter((routine) => routine.kind === "procedure").length;
    const routineHref = (oid) => {
      return detailViewHref(viewBaseUrl, oid) + (selectedKind ? `&kind=${encodeURIComponent(selectedKind)}` : "");
    };
    const rows = routines.map((routine) => {
      const searchable = `${routine.name} ${routine.kind} ${routine.identity_arguments || ""} ${routine.result_type || ""} ${routine.language || ""}`.toLowerCase();
      return `<tr class="db-code-row" data-kind="${escapeHtml(routine.kind)}" data-searchable="${escapeHtml(searchable)}">
<td>${kindBadge(routine.kind)}</td>
<td><a class="fw-bold text-decoration-none" href="${routineHref(routine.oid)}">${escapeHtml(routine.name)}</a><div class="small text-muted"><code>${escapeHtml(routine.schema)}.${escapeHtml(routine.name)}</code></div></td>
<td><code>${escapeHtml(routine.identity_arguments || "")}</code></td>
<td><code>${escapeHtml(routine.result_type || "")}</code></td>
<td><span class="badge bg-light text-dark border me-1">${escapeHtml(routine.language)}</span>${volatilityBadge(routine.volatility)}${routine.prosecdef ? `<span class="badge bg-danger">SECURITY DEFINER</span>` : ""}</td>
<td class="text-nowrap">
  <a class="btn btn-sm btn-outline-primary" href="${routineHref(routine.oid)}"><i class="fas fa-eye me-1"></i>View</a>
  <a class="btn btn-sm btn-outline-secondary" href="${routeHref(`/db-code/routine/${routine.oid}/edit`, viewBaseUrl)}"><i class="fas fa-edit me-1"></i>Edit</a>
</td>
</tr>`;
    }).join("");

    const filterButtons = `<div class="btn-group btn-group-sm" role="group" aria-label="Routine type filters">
${KIND_OPTIONS.map((opt) => `<a class="btn btn-${selectedKind === opt.value ? "" : "outline-"}primary" href="${filterUrl(baseUrl, opt.value, viewBaseUrl)}"><i class="${opt.icon} me-1"></i>${escapeHtml(opt.label)}</a>`).join("")}
</div>`;

    const styles = `<style>
.db-code-console .db-code-row td { vertical-align: middle; }
.db-code-console .db-code-toolbar { gap: .5rem; }
.db-code-console .db-code-stat { min-width: 8rem; }
.db-code-console .db-code-empty { min-height: 10rem; }
.db-code-console .table-responsive { border-radius: .375rem; }
</style>`;

    const script = `<script>
(function(){
  const root = document.currentScript.closest('.db-code-console');
  if (!root) return;
  const search = root.querySelector('.db-code-search');
  const rows = Array.from(root.querySelectorAll('.db-code-row'));
  const empty = root.querySelector('.db-code-empty');
  function applySearch(){
    const q = (search && search.value || '').toLowerCase().trim();
    let visible = 0;
    rows.forEach((row) => {
      const ok = !q || (row.getAttribute('data-searchable') || '').includes(q);
      row.classList.toggle('d-none', !ok);
      if (ok) visible += 1;
    });
    if (empty) empty.classList.toggle('d-none', visible !== 0);
  }
  if (search) search.addEventListener('input', applySearch);
  applySearch();
})();
</script>`;

    return `${styles}<div class="db-code-console">
<div class="card mt-0 card-max-full-screen">
  <div class="card-header d-flex justify-content-between align-items-center flex-wrap db-code-toolbar">
    <div>
      <h5 class="mb-0"><i class="fas fa-database me-2"></i>DB Code Console</h5>
      <div class="small text-muted">PostgreSQL functions and stored procedures in the current tenant schema</div>
    </div>
    ${showWriteActions ? `<div class="d-flex flex-wrap gap-1" role="group" aria-label="Routine actions">
      <div class="btn-group btn-group-sm" role="group">
        <a class="btn btn-primary" href="${routeHref("/db-code/new", viewBaseUrl)}"><i class="fas fa-plus me-1"></i>New function</a>
        <a class="btn btn-outline-primary" href="${routeHref("/db-code/new-procedure", viewBaseUrl)}"><i class="fas fa-plus me-1"></i>New stored procedure</a>
        <a class="btn btn-outline-secondary" href="${routeHref("/db-code/new-ddl", viewBaseUrl)}"><i class="fas fa-file-code me-1"></i>New from DDL</a>
      </div>
      <div class="btn-group btn-group-sm" role="group">
        <a class="btn btn-info text-white" href="${routeHref("/db-code/export", viewBaseUrl)}"><i class="fas fa-download me-1"></i>Export</a>
        <a class="btn btn-outline-success" href="${routeHref("/db-code/import", viewBaseUrl)}"><i class="fas fa-upload me-1"></i>Import</a>
      </div>
    </div>` : ""}
  </div>
  <div class="card-body">
    <div class="d-flex flex-wrap align-items-center justify-content-between mb-3 db-code-toolbar">
      <div class="d-flex flex-wrap align-items-center db-code-toolbar">
        ${filterButtons}
        <div class="input-group input-group-sm" style="max-width: 320px;">
          <span class="input-group-text"><i class="fas fa-search"></i></span>
          <input class="form-control db-code-search" placeholder="Search routines">
        </div>
      </div>
      <div class="d-flex flex-wrap db-code-toolbar small">
        <span class="badge bg-secondary db-code-stat">${allRoutines.length} routines</span>
        <span class="badge bg-primary db-code-stat">${functionCount} functions</span>
        <span class="badge bg-warning text-dark db-code-stat">${procedureCount} procedures</span>
      </div>
    </div>
    <div class="table-responsive">
      <table class="table table-sm table-hover align-middle mb-0">
        <thead><tr><th>Type</th><th>Name</th><th>Arguments</th><th>Returns</th><th>Metadata</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="db-code-empty text-center text-muted py-5 ${rows ? "d-none" : ""}">
      <div class="h5">No routines found</div>
      <div>Try adjusting your search or filter options.</div>
    </div>
  </div>
</div>
${script}
</div>`;
  } catch (error) {
    return unsupportedHtml(error);
  }
}

async function renderRoutineDetail(oid, { baseUrl = "/db-code", useViewState = false, showWriteActions = true, kind = "" } = {}) {
  const viewBaseUrl = useViewState ? baseUrl : null;
  try {
    const routine = await getRoutineByOid(oid);
    if (!routine) return `<div class="alert alert-warning">Routine not found in the current tenant schema.</div>`;
    const backHref = viewBaseUrl ? listViewHref(viewBaseUrl, kind) : baseUrl;
    const routineIcon = routine.kind === "procedure" ? "fas fa-cogs" : "fas fa-cube";
    const securityBadge = routine.prosecdef
      ? `<span class="badge bg-danger"><i class="fas fa-user-shield me-1"></i>SECURITY DEFINER</span>`
      : `<span class="badge bg-light text-dark border"><i class="fas fa-user me-1"></i>SECURITY INVOKER</span>`;
    const styles = `<style>
.db-code-detail .db-code-detail-icon { width: 2.25rem; height: 2.25rem; display: inline-flex; align-items: center; justify-content: center; }
.db-code-detail .db-code-toolbar { gap: .5rem; }
.db-code-detail .db-code-meta th { width: 38%; color: var(--bs-secondary-color, #6c757d); font-weight: 600; }
.db-code-detail .db-code-definition { max-height: 65vh; overflow: auto; }
.db-code-detail .db-code-definition textarea { border: none; background: transparent; }
.db-code-detail .db-code-definition .monaco-editor { border-radius: .375rem; }
.db-code-detail .sticky-meta { position: sticky; top: 1rem; }
</style>`;
    const copyScript = `<script>
(function(){
  const root = document.currentScript.closest('.db-code-detail');
  if (!root) return;
  const wrap = root.querySelector('.db-code-definition');
  // Make Monaco read-only once it initializes
  function lockEditor() {
    var edta = wrap ? wrap.querySelector('textarea') : null;
    if (!edta) return;
    var m = edta.nextElementSibling;
    if (!m) return;
    var ed = $(m).data('monaco-editor');
    if (ed && ed.updateOptions) ed.updateOptions({ readOnly: true, domReadOnly: true });
  }
  // Try immediately and after a delay (Monaco init is async)
  lockEditor();
  setTimeout(lockEditor, 500);
  setTimeout(lockEditor, 1500);
  // Copy button
  const btn = root.querySelector('.db-code-copy-definition');
  if (!btn || !wrap || !navigator.clipboard) return;
  btn.addEventListener('click', async function(){
    var edta2 = wrap.querySelector('textarea');
    var m2 = edta2 ? edta2.nextElementSibling : null;
    var ed2 = m2 ? $(m2).data('monaco-editor') : null;
    var text = '';
    if (ed2 && ed2.getModel) text = ed2.getModel().getValue();
    else if (edta2) text = edta2.value;
    else text = wrap.textContent || '';
    await navigator.clipboard.writeText(text);
    const old = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check me-1"></i>Copied';
    setTimeout(function(){ btn.innerHTML = old; }, 1200);
  });
})();
</script>`;
    return `${styles}<div class="db-code-detail">
<p><a class="text-decoration-none" href="${backHref}"><i class="fas fa-arrow-left me-1"></i>Back to DB Code</a></p>
<div class="card mt-0 card-max-full-screen">
  <div class="card-header d-flex justify-content-between align-items-center flex-wrap db-code-toolbar">
    <div class="d-flex align-items-center">
      <span class="db-code-detail-icon rounded bg-primary text-white me-2"><i class="${routineIcon}"></i></span>
      <div>
        <h5 class="mb-0">${escapeHtml(routine.name)}</h5>
        <div class="small text-muted"><code>${escapeHtml(routine.schema)}.${escapeHtml(routine.name)}(${escapeHtml(routine.identity_arguments || "")})</code></div>
      </div>
    </div>
    ${showWriteActions ? `<div class="btn-group btn-group-sm" role="group" aria-label="Routine actions">
      <a class="btn btn-primary" href="${routeHref(`/db-code/routine/${routine.oid}/edit`, viewBaseUrl)}"><i class="fas fa-edit me-1"></i>Edit</a>
      <a class="btn btn-outline-secondary" href="${routeHref(`/db-code/routine/${routine.oid}/execute`, viewBaseUrl)}"><i class="fas fa-play me-1"></i>Test / execute</a>
      <a class="btn btn-outline-danger" href="${routeHref(`/db-code/routine/${routine.oid}/delete`, viewBaseUrl)}"><i class="fas fa-trash me-1"></i>Delete</a>
    </div>` : ""}
  </div>
  <div class="card-body">
    <div class="row g-4">
      <div class="col-lg-8">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <div class="form-section-title text-muted fw-bold text-uppercase small mb-0">Definition</div>
          <button type="button" class="btn btn-sm btn-outline-secondary db-code-copy-definition"><i class="fas fa-copy me-1"></i>Copy SQL</button>
        </div>
        <div class="db-code-definition border rounded bg-light mb-0">
          <textarea class="to-code font-monospace" mode="text/x-sql" readonly style="width:100%;min-height:12rem;border:none;background:transparent;resize:vertical;">${escapeHtml(routine.definition)}</textarea>
        </div>
      </div>
      <div class="col-lg-4">
        <div class="sticky-meta">
          <div class="card bg-light border-0 mb-3"><div class="card-body">
            <div class="form-section-title text-muted fw-bold text-uppercase small">Metadata</div>
            <div class="mb-3 d-flex flex-wrap gap-1">
              ${kindBadge(routine.kind)}
              <span class="badge bg-light text-dark border">${escapeHtml(routine.language)}</span>
              ${volatilityBadge(routine.volatility)}
              ${securityBadge}
            </div>
            <table class="table table-sm db-code-meta mb-0">
              <tr><th>OID</th><td><code>${escapeHtml(routine.oid)}</code></td></tr>
              <tr><th>Schema</th><td><code>${escapeHtml(routine.schema)}</code></td></tr>
              <tr><th>Type</th><td>${escapeHtml(routine.kind)}</td></tr>
              <tr><th>Arguments</th><td><code>${escapeHtml(routine.arguments || "")}</code></td></tr>
              <tr><th>Identity args</th><td><code>${escapeHtml(routine.identity_arguments || "")}</code></td></tr>
              <tr><th>Returns</th><td><code>${escapeHtml(routine.result_type || "")}</code></td></tr>
            </table>
          </div></div>
          <div class="card border-0 bg-light"><div class="card-body">
            <div class="form-section-title text-muted fw-bold text-uppercase small">Description</div>
            <p class="mb-0 small">${escapeHtml(routine.description || "No description set for this routine.")}</p>
          </div></div>
        </div>
      </div>
    </div>
  </div>
</div>
${copyScript}
</div>`;
  } catch (error) {
    return unsupportedHtml(error);
  }
}

module.exports = { renderRoutineList, renderRoutineDetail };
