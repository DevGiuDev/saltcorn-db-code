const db = require("@saltcorn/data/db");
const { requireAdmin } = require("../lib/auth");
const { escapeHtml, page } = require("../lib/html");
const { ensurePostgres, getRoutineByOid } = require("../lib/introspection");
const { buildDropRoutineSql } = require("../lib/sql-builders");
const { detailViewHref, listViewHref, viewContextInput, getViewBaseUrl } = require("../lib/view-context");

function csrfInput(req) {
  return typeof req.csrfToken === "function" ? `<input type="hidden" name="_csrf" value="${escapeHtml(req.csrfToken())}">` : "";
}

async function getRoutineDependencies(oid) {
  const parsedOid = Number.parseInt(oid, 10);
  const { rows } = await db.query(
    `SELECT
       d.deptype,
       pg_describe_object(d.classid, d.objid, d.objsubid) AS dependent_object
     FROM pg_depend d
     WHERE d.refclassid = 'pg_proc'::regclass
       AND d.refobjid = $1
       AND d.deptype NOT IN ('i', 'p')
     ORDER BY dependent_object`,
    [parsedOid]
  );
  return rows;
}

function formStyles() {
  return `<style>
.db-code-delete .db-code-delete-icon { width: 2.25rem; height: 2.25rem; display: inline-flex; align-items: center; justify-content: center; }
.db-code-delete .form-section-title { font-size: .78rem; letter-spacing: .06em; text-transform: uppercase; color: var(--bs-secondary-color, #6c757d); font-weight: 700; margin-bottom: .75rem; }
.db-code-delete .sticky-help { position: sticky; top: 1rem; }
</style>`;
}

function renderDeleteForm(req, routine, dependencies = [], error = null, viewBaseUrl = null) {
  const dropSql = buildDropRoutineSql({
    schema: routine.schema,
    name: routine.name,
    identityArguments: routine.identity_arguments || "",
    kind: routine.kind
  });
  const hasDependencies = dependencies.length > 0;
  const backHref = detailViewHref(viewBaseUrl, routine.oid);
  return `${formStyles()}<div class="db-code-delete">
<p><a class="text-decoration-none" href="${backHref}"><i class="fas fa-arrow-left me-1"></i>Back to routine</a></p>
${error ? `<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>${escapeHtml(error)}</div>` : ""}
<div class="card mt-0">
  <div class="card-header d-flex justify-content-between align-items-center flex-wrap">
    <div class="d-flex align-items-center">
      <span class="db-code-delete-icon rounded bg-danger text-white me-2"><i class="fas fa-trash"></i></span>
      <div><h5 class="mb-0">Delete ${escapeHtml(routine.kind)}: ${escapeHtml(routine.name)}</h5><div class="small text-muted">Drop this PostgreSQL routine from the current tenant schema</div></div>
    </div>
    <a class="btn btn-sm btn-outline-secondary" href="${backHref}">Cancel</a>
  </div>
  <div class="card-body">
    <div class="row g-4">
      <div class="col-lg-8">
        <div class="alert alert-danger">
          <strong>This action cannot be undone.</strong> DB Code will execute a plain DROP statement without CASCADE.
        </div>
        <div class="form-section-title">SQL to execute</div>
        <pre class="border rounded p-3 bg-light"><code>${escapeHtml(dropSql)}</code></pre>
        <form method="post" action="/db-code/routine/${routine.oid}/delete">
          ${csrfInput(req)}
          ${viewContextInput(viewBaseUrl)}
          <div class="mb-3">
            <label class="form-label">Type the routine name to confirm</label>
            <input class="form-control" name="confirmName" required autocomplete="off" placeholder="${escapeHtml(routine.name)}">
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-danger" type="submit"><i class="fas fa-trash me-1"></i>Delete routine</button>
            <a class="btn btn-outline-secondary" href="${backHref}">Cancel</a>
          </div>
        </form>
      </div>
      <div class="col-lg-4"><div class="sticky-help">
        <div class="card bg-light border-0 mb-3"><div class="card-body">
          <div class="form-section-title">Routine identity</div>
          <table class="table table-sm mb-0">
            <tr><th>Schema</th><td><code>${escapeHtml(routine.schema)}</code></td></tr>
            <tr><th>Name</th><td><code>${escapeHtml(routine.name)}</code></td></tr>
            <tr><th>Type</th><td>${escapeHtml(routine.kind)}</td></tr>
            <tr><th>Arguments</th><td><code>${escapeHtml(routine.identity_arguments || "")}</code></td></tr>
          </table>
        </div></div>
        <div class="card ${hasDependencies ? "border-warning" : "border-success"}"><div class="card-body">
          <div class="form-section-title">Dependencies</div>
          ${hasDependencies ? `<div class="alert alert-warning py-2 small">PostgreSQL may reject the drop because dependent objects exist. CASCADE is intentionally not used.</div><ul class="small mb-0">${dependencies.map((dep) => `<li>${escapeHtml(dep.dependent_object || dep.deptype)}</li>`).join("")}</ul>` : `<div class="text-success small"><i class="fas fa-check me-1"></i>No direct dependencies found through pg_depend.</div>`}
        </div></div>
      </div></div>
    </div>
  </div>
</div>
</div>`;
}

async function deleteFormRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    ensurePostgres();
    const routine = await getRoutineByOid(req.params.oid);
    if (!routine) {
      if (typeof res.status === "function") res.status(404);
      return page(req, res, "Routine not found", `<div class="alert alert-warning">Routine not found in the current tenant schema.</div>`);
    }
    const dependencies = await getRoutineDependencies(routine.oid);
    page(req, res, `Delete ${routine.kind}: ${routine.name}`, renderDeleteForm(req, routine, dependencies, null, getViewBaseUrl(req)));
  } catch (error) {
    page(req, res, "Delete routine", `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`);
  }
}

async function deletePostRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  const viewBaseUrl = getViewBaseUrl(req);
  try {
    ensurePostgres();
    const routine = await getRoutineByOid(req.params.oid);
    if (!routine) {
      if (typeof res.status === "function") res.status(404);
      return page(req, res, "Routine not found", `<div class="alert alert-warning">Routine not found in the current tenant schema.</div>`);
    }
    if ((req.body?.confirmName || "") !== routine.name) {
      const dependencies = await getRoutineDependencies(routine.oid);
      return page(req, res, `Delete ${routine.kind}: ${routine.name}`, renderDeleteForm(req, routine, dependencies, "Confirmation name does not match.", viewBaseUrl));
    }
    const dropSql = buildDropRoutineSql({
      schema: routine.schema,
      name: routine.name,
      identityArguments: routine.identity_arguments || "",
      kind: routine.kind
    });
    await db.query(dropSql);
    if (typeof req.flash === "function") req.flash("success", `Routine ${escapeHtml(routine.name)} deleted`);
    res.redirect(listViewHref(viewBaseUrl, routine.kind === "procedure" ? "procedure" : "function"));
  } catch (error) {
    const routine = await getRoutineByOid(req.params.oid).catch(() => null);
    if (routine) {
      const dependencies = await getRoutineDependencies(routine.oid).catch(() => []);
      page(req, res, `Delete ${routine.kind}: ${routine.name}`, renderDeleteForm(req, routine, dependencies, error.message, viewBaseUrl));
    } else {
      page(req, res, "Delete routine", `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`);
    }
  }
}

module.exports = { deleteFormRoute, deletePostRoute, getRoutineDependencies };
