const db = require("@saltcorn/data/db");
const { requireAdmin } = require("../lib/auth");
const { escapeHtml, page } = require("../lib/html");
const { currentTenantSchema, ensurePostgres, getRoutineByOid } = require("../lib/introspection");
const { validateCreateRoutineDdl } = require("../lib/sql-builders");

function csrfInput(req) {
  return typeof req.csrfToken === "function" ? `<input type="hidden" name="_csrf" value="${escapeHtml(req.csrfToken())}">` : "";
}

function renderEditForm(req, routine, values = {}, error = null) {
  const ddl = typeof values.ddl === "undefined" ? routine.definition : values.ddl;
  return `<p><a href="/db-code/routine/${routine.oid}">← Back to routine</a></p>
${error ? `<div class="alert alert-danger">${escapeHtml(error)}</div>` : ""}
<div class="alert alert-warning">
  Editing runs the DDL below. Keep the same routine identity unless you intentionally want PostgreSQL to create a different overload. Changing a function return type may require dropping and recreating it.
</div>
<table class="table table-sm">
<tr><th>Name</th><td>${escapeHtml(routine.schema)}.${escapeHtml(routine.name)}</td></tr>
<tr><th>Type</th><td>${escapeHtml(routine.kind)}</td></tr>
<tr><th>Identity arguments</th><td><code>${escapeHtml(routine.identity_arguments || "")}</code></td></tr>
</table>
<form method="post" action="/db-code/routine/${routine.oid}/edit">
${csrfInput(req)}
<div class="mb-3">
  <label class="form-label">Routine DDL</label>
  <textarea class="form-control to-code font-monospace" mode="text/x-sql" name="ddl" rows="22" required>${escapeHtml(ddl)}</textarea>
</div>
<button class="btn btn-primary" type="submit">Save routine</button>
<a class="btn btn-outline-secondary" href="/db-code/routine/${routine.oid}">Cancel</a>
</form>`;
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
    page(req, res, `Edit ${routine.kind}: ${routine.name}`, renderEditForm(req, routine));
  } catch (error) {
    page(req, res, "Edit routine", `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`);
  }
}

async function editPostRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  const values = req.body || {};
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
    res.redirect(`/db-code/routine/${routine.oid}`);
  } catch (error) {
    const routine = await getRoutineByOid(req.params.oid).catch(() => null);
    if (routine) page(req, res, `Edit ${routine.kind}: ${routine.name}`, renderEditForm(req, routine, values, error.message));
    else page(req, res, "Edit routine", `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`);
  }
}

module.exports = { editFormRoute, editPostRoute };
