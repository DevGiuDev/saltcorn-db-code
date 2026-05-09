const { requireAdmin } = require("../lib/auth");
const { escapeHtml, page } = require("../lib/html");
const { ensurePostgres, currentTenantSchema } = require("../lib/introspection");
const { validateImportPack, remapSchemaInDdl, renderPackPreview } = require("../lib/export-import");
const { listViewHref, viewContextInput, getViewBaseUrl } = require("../lib/view-context");

const db = require("@saltcorn/data/db");

function csrfInput(req) {
  return typeof req.csrfToken === "function" ? `<input type="hidden" name="_csrf" value="${escapeHtml(req.csrfToken())}">` : "";
}

function formStyles() {
  return `<style>
.db-code-import .db-code-import-icon { width: 2.25rem; height: 2.25rem; display: inline-flex; align-items: center; justify-content: center; }
.db-code-import .form-section-title { font-size: .78rem; letter-spacing: .06em; text-transform: uppercase; color: var(--bs-secondary-color, #6c757d); font-weight: 700; margin-bottom: .75rem; }
.db-code-import .result-ok { color: var(--bs-success, #198754); }
.db-code-import .result-err { color: var(--bs-danger, #dc3545); }
.db-code-import .result-skip { color: var(--bs-secondary-color, #6c757d); }
</style>`;
}

function renderUploadForm(req, viewBaseUrl) {
  const backHref = listViewHref(viewBaseUrl);
  return `${formStyles()}<div class="db-code-import">
<p><a class="text-decoration-none" href="${backHref}"><i class="fas fa-arrow-left me-1"></i>Back to DB Code</a></p>
<div class="card mt-0 card-max-full-screen">
  <div class="card-header d-flex justify-content-between align-items-center flex-wrap">
    <div class="d-flex align-items-center">
      <span class="db-code-import-icon rounded bg-success text-white me-2"><i class="fas fa-upload"></i></span>
      <div><h5 class="mb-0">Import routines</h5><div class="small text-muted">Upload a DB Code routine pack (JSON)</div></div>
    </div>
    <a class="btn btn-sm btn-outline-secondary" href="${backHref}">Cancel</a>
  </div>
  <div class="card-body">
    <form method="post" action="/db-code/import" enctype="multipart/form-data">
      ${csrfInput(req)}
      ${viewContextInput(viewBaseUrl)}
      <div class="mb-3">
        <label class="form-label">Pack file</label>
        <input class="form-control" type="file" name="packfile" accept=".json" required>
        <div class="form-text">Select a JSON file exported from DB Code.</div>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-success" type="submit"><i class="fas fa-upload me-1"></i>Upload and preview</button>
        <a class="btn btn-outline-secondary" href="${backHref}">Cancel</a>
      </div>
    </form>
  </div>
</div>
</div>`;
}

function renderPreviewForm(req, pack, viewBaseUrl) {
  const backHref = listViewHref(viewBaseUrl);
  const schema = currentTenantSchema();
  const needsRemap = pack.source_schema && pack.source_schema !== schema;
  const remapNotice = needsRemap
    ? `<div class="alert alert-warning py-2"><i class="fas fa-exclamation-triangle me-1"></i>Schema remapping: the pack was exported from <code>${escapeHtml(pack.source_schema)}</code> but the current tenant schema is <code>${escapeHtml(schema)}</code>. DDL statements will be remapped automatically.</div>`
    : "";

  return `${formStyles()}<div class="db-code-import">
<p><a class="text-decoration-none" href="${backHref}"><i class="fas fa-arrow-left me-1"></i>Back to DB Code</a></p>
<div class="card mt-0 card-max-full-screen">
  <div class="card-header d-flex justify-content-between align-items-center flex-wrap">
    <div class="d-flex align-items-center">
      <span class="db-code-import-icon rounded bg-success text-white me-2"><i class="fas fa-upload"></i></span>
      <div><h5 class="mb-0">Import preview</h5><div class="small text-muted">${pack.routines.length} routine${pack.routines.length !== 1 ? "s" : ""} in the pack · exported ${escapeHtml(pack.exported_at || "unknown")}</div></div>
    </div>
    <a class="btn btn-sm btn-outline-secondary" href="/db-code/import">Cancel</a>
  </div>
  <div class="card-body">
    ${remapNotice}
    <form method="post" action="/db-code/import/execute">
      ${csrfInput(req)}
      ${viewContextInput(viewBaseUrl)}
      <input type="hidden" name="pack_json" value="${escapeHtml(JSON.stringify(pack))}">
      <div class="form-section-title">Select routines to import</div>
      ${renderPackPreview(pack)}
      <div class="d-flex gap-2 mt-3">
        <button class="btn btn-success" type="submit"><i class="fas fa-play me-1"></i>Import selected routines</button>
        <a class="btn btn-outline-secondary" href="/db-code/import">Cancel</a>
      </div>
    </form>
  </div>
</div>
</div>`;
}

function renderResults(req, results, viewBaseUrl) {
  const backHref = listViewHref(viewBaseUrl);
  const okCount = results.filter((r) => r.status === "ok").length;
  const errCount = results.filter((r) => r.status === "error").length;
  const skipCount = results.filter((r) => r.status === "skipped").length;

  const summary = [];
  if (okCount) summary.push(`<span class="badge bg-success">${okCount} imported</span>`);
  if (errCount) summary.push(`<span class="badge bg-danger">${errCount} failed</span>`);
  if (skipCount) summary.push(`<span class="badge bg-secondary">${skipCount} skipped</span>`);

  const rows = results.map((r) => {
    const icon = r.status === "ok" ? "fas fa-check-circle result-ok" : r.status === "error" ? "fas fa-times-circle result-err" : "fas fa-minus-circle result-skip";
    const kindClass = r.kind === "procedure" ? "bg-warning text-dark" : "bg-primary";
    const detail = r.status === "error" ? `<div class="small text-danger mt-1">${escapeHtml(r.error)}</div>` : "";
    return `<tr>
  <td><i class="${icon}"></i></td>
  <td><span class="badge ${kindClass}">${escapeHtml(r.kind)}</span></td>
  <td><code>${escapeHtml(r.name)}</code></td>
  <td>${escapeHtml(r.status)}${detail}</td>
</tr>`;
  }).join("");

  return `${formStyles()}<div class="db-code-import">
<p><a class="text-decoration-none" href="${backHref}"><i class="fas fa-arrow-left me-1"></i>Back to DB Code</a></p>
<div class="card mt-0 card-max-full-screen">
  <div class="card-header d-flex justify-content-between align-items-center flex-wrap">
    <div class="d-flex align-items-center">
      <span class="db-code-import-icon rounded ${errCount > 0 ? "bg-warning text-dark" : "bg-success text-white"} me-2"><i class="fas fa-clipboard-check"></i></span>
      <div><h5 class="mb-0">Import results</h5><div class="small text-muted">${summary.join(" ")}</div></div>
    </div>
    <a class="btn btn-sm btn-outline-secondary" href="${backHref}">Done</a>
  </div>
  <div class="card-body">
    <div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0">
<thead><tr><th></th><th>Type</th><th>Name</th><th>Status</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
    <div class="d-flex gap-2 mt-3">
      <a class="btn btn-outline-secondary" href="${backHref}"><i class="fas fa-arrow-left me-1"></i>Back to DB Code</a>
      <a class="btn btn-outline-primary" href="/db-code/import"><i class="fas fa-upload me-1"></i>Import another pack</a>
    </div>
  </div>
</div>
</div>`;
}

/**
 * GET /db-code/import — show upload form
 */
async function importFormRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  page(req, res, "Import routines", renderUploadForm(req, getViewBaseUrl(req)));
}

/**
 * POST /db-code/import — parse uploaded file, show preview
 */
async function importPostRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  const viewBaseUrl = getViewBaseUrl(req);
  try {
    ensurePostgres();
    // Get uploaded file content
    const file = req.files?.packfile || req.file;
    if (!file) {
      return page(req, res, "Import routines", renderUploadForm(req, viewBaseUrl) + `<div class="alert alert-warning mt-2">No file uploaded.</div>`);
    }
    const rawText = file.data ? file.data.toString("utf8") : String(file.buffer || "");
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      return page(req, res, "Import routines", renderUploadForm(req, viewBaseUrl) + `<div class="alert alert-danger mt-2">Invalid JSON file: ${escapeHtml(e.message)}</div>`);
    }
    const validation = validateImportPack(parsed);
    if (!validation.valid) {
      return page(req, res, "Import routines", renderUploadForm(req, viewBaseUrl) + `<div class="alert alert-danger mt-2">${escapeHtml(validation.error)}</div>`);
    }
    page(req, res, "Import preview", renderPreviewForm(req, validation.pack, viewBaseUrl));
  } catch (error) {
    page(req, res, "Import routines", `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`);
  }
}

/**
 * POST /db-code/import/execute — execute selected DDLs
 */
async function importExecuteRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  const viewBaseUrl = getViewBaseUrl(req);
  try {
    ensurePostgres();
    const schema = currentTenantSchema();
    let pack;
    try {
      pack = JSON.parse(req.body?.pack_json || "null");
    } catch {
      return page(req, res, "Import routines", `<div class="alert alert-danger">Corrupted pack data.</div>`);
    }
    const validation = validateImportPack(pack);
    if (!validation.valid) {
      return page(req, res, "Import routines", `<div class="alert alert-danger">${escapeHtml(validation.error)}</div>`);
    }

    const results = [];
    for (let i = 0; i < validation.pack.routines.length; i++) {
      const r = validation.pack.routines[i];
      const selected = req.body?.[`import_${i}`];
      if (!selected) {
        results.push({ name: r.name, kind: r.kind, status: "skipped" });
        continue;
      }
      try {
        let ddl = r.ddl;
        // Remap schema if necessary
        if (validation.pack.source_schema && validation.pack.source_schema !== schema) {
          ddl = remapSchemaInDdl(ddl, validation.pack.source_schema, schema);
        }
        await db.query(ddl);
        results.push({ name: r.name, kind: r.kind, status: "ok" });
      } catch (err) {
        results.push({ name: r.name, kind: r.kind, status: "error", error: err.message });
      }
    }
    page(req, res, "Import results", renderResults(req, results, viewBaseUrl));
  } catch (error) {
    page(req, res, "Import routines", `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`);
  }
}

module.exports = { importFormRoute, importPostRoute, importExecuteRoute };
