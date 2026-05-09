const { requireAdmin } = require("../lib/auth");
const { escapeHtml, page } = require("../lib/html");
const { listRoutines } = require("../lib/introspection");

async function listRoute({ req, res }) {
  if (!requireAdmin(req, res)) return;
  try {
    const routines = await listRoutines();
    const rows = routines.map((routine) => `<tr>
<td><a href="/db-code/routine/${routine.oid}">${escapeHtml(routine.name)}</a></td>
<td>${escapeHtml(routine.kind)}</td>
<td><code>${escapeHtml(routine.identity_arguments)}</code></td>
<td><code>${escapeHtml(routine.result_type || "")}</code></td>
<td>${escapeHtml(routine.language)}</td>
<td><a class="btn btn-sm btn-outline-primary" href="/db-code/routine/${routine.oid}">View</a></td>
</tr>`).join("");
    const body = `<p class="text-muted">PostgreSQL routines in the current Saltcorn tenant schema.</p>
<div class="mb-3"><a class="btn btn-primary" href="/db-code/new">New function</a></div>
<table class="table table-striped table-sm">
<thead><tr><th>Name</th><th>Type</th><th>Arguments</th><th>Returns</th><th>Language</th><th>Actions</th></tr></thead>
<tbody>${rows || `<tr><td colspan="6" class="text-muted">No routines found in this schema.</td></tr>`}</tbody>
</table>`;
    page(req, res, "DB Code", body);
  } catch (error) {
    page(req, res, "DB Code", `<div class="alert alert-warning">${escapeHtml(error.message)}</div>`);
  }
}

module.exports = listRoute;
