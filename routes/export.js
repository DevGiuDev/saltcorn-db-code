const { requireAdmin } = require("../lib/auth");
const { escapeHtml, page } = require("../lib/html");
const { ensurePostgres, listRoutines, currentTenantSchema } = require("../lib/introspection");
const { buildExportPack } = require("../lib/export-import");
const { listViewHref, routeHref, viewContextInput, getViewBaseUrl } = require("../lib/view-context");

function csrfInput(req) {
  return typeof req.csrfToken === "function" ? `<input type="hidden" name="_csrf" value="${escapeHtml(req.csrfToken())}">` : "";
}

function formStyles() {
  return `<style>
.db-code-export .db-code-export-icon { width: 2.25rem; height: 2.25rem; display: inline-flex; align-items: center; justify-content: center; }
.db-code-export .form-section-title { font-size: .78rem; letter-spacing: .06em; text-transform: uppercase; color: var(--bs-secondary-color, #6c757d); font-weight: 700; margin-bottom: .75rem; }
</style>`;
}

function renderExportForm(req, routines, viewBaseUrl) {
  const backHref = listViewHref(viewBaseUrl);
  const routineRows = routines.map((r, i) => {
    const kindIcon = r.kind === "procedure" ? "fas fa-cogs" : "fas fa-cube";
    const kindClass = r.kind === "procedure" ? "bg-warning text-dark" : "bg-primary";
    return `<tr>
  <td><input class="form-check-input" type="checkbox" name="export_${i}" value="${r.oid}" checked></td>
  <td><span class="badge ${kindClass}"><i class="${kindIcon} me-1"></i>${escapeHtml(r.kind === "procedure" ? "Stored proc." : "Function")}</span></td>
  <td><code>${escapeHtml(r.name)}</code></td>
  <td><code>${escapeHtml(r.identity_arguments || "none")}</code></td>
  <td><code>${escapeHtml(r.result_type || "—")}</code></td>
  <td><span class="badge bg-light text-dark border">${escapeHtml(r.language)}</span></td>
</tr>`;
  }).join("");

  return `${formStyles()}<div class="db-code-export">
<p><a class="text-decoration-none" href="${backHref}"><i class="fas fa-arrow-left me-1"></i>Back to DB Code</a></p>
<div class="card mt-0 card-max-full-screen">
  <div class="card-header d-flex justify-content-between align-items-center flex-wrap">
    <div class="d-flex align-items-center">
      <span class="db-code-export-icon rounded bg-info text-white me-2"><i class="fas fa-download"></i></span>
      <div><h5 class="mb-0">Export routines</h5><div class="small text-muted">Download selected routines as a JSON pack</div></div>
    </div>
    <a class="btn btn-sm btn-outline-secondary" href="${backHref}">Cancel</a>
  </div>
  <div class="card-body">
    <form method="post" action="/db-code/export">
      ${csrfInput(req)}
      ${viewContextInput(viewBaseUrl)}
      ${routines.length > 0 ? `<div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0">
<thead><tr>
  <th><input class="form-check-input" type="checkbox" id="exportToggleAll" checked></th>
  <th>Type</th><th>Name</th><th>Arguments</th><th>Returns</th><th>Language</th>
</tr></thead>
<tbody>${routineRows}</tbody>
</table></div>
<script>
(function(){
  var toggle = document.getElementById('exportToggleAll');
  if (!toggle) return;
  var boxes = document.querySelectorAll('input[name^="export_"]');
  toggle.addEventListener('change', function(){ boxes.forEach(function(b){ b.checked = toggle.checked; }); });
})();
</script>
<div class="d-flex gap-2 mt-3">
  <button class="btn btn-info text-white" type="submit"><i class="fas fa-download me-1"></i>Export ${routines.length} routine${routines.length !== 1 ? "s" : ""}</button>
  <a class="btn btn-outline-secondary" href="${backHref}">Cancel</a>
</div>` : `<div class="text-muted text-center py-4"><i class="fas fa-info-circle me-2"></i>No routines found to export.</div>`}
    </form>
  </div>
</div>
</div>`;
}

/**
 * GET /db-code/export — show selection form
 */
async function exportFormRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    ensurePostgres();
    const routines = await listRoutines();
    page(req, res, "Export routines", renderExportForm(req, routines, getViewBaseUrl(req)));
  } catch (error) {
    page(req, res, "Export routines", `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`);
  }
}

/**
 * POST /db-code/export — generate and download JSON pack
 */
async function exportPostRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    ensurePostgres();
    const allRoutines = await listRoutines();
    const oidSet = new Set();
    for (const [key, value] of Object.entries(req.body || {})) {
      if (key.startsWith("export_") && value) oidSet.add(String(value));
    }
    if (oidSet.size === 0) {
      return page(req, res, "Export routines", renderExportForm(req, allRoutines, getViewBaseUrl(req)));
    }
    const selected = allRoutines.filter((r) => oidSet.has(String(r.oid)));
    if (selected.length === 0) {
      return page(req, res, "Export routines", renderExportForm(req, allRoutines, getViewBaseUrl(req)));
    }
    const schema = currentTenantSchema();
    const pack = buildExportPack(selected, schema);
    const json = JSON.stringify(pack, null, 2);
    const filename = `db-code-routines-${schema}-${new Date().toISOString().slice(0, 10)}.json`;

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    if (typeof res.send === "function") res.send(json);
    else if (typeof res.end === "function") res.end(json);
  } catch (error) {
    page(req, res, "Export routines", `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`);
  }
}

module.exports = { exportFormRoute, exportPostRoute };
