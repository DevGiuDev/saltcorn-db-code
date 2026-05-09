const { requireAdmin } = require("../lib/auth");
const { escapeHtml, page } = require("../lib/html");
const { getRoutineByOid } = require("../lib/introspection");

async function showRoute({ req, res }) {
  if (!requireAdmin(req, res)) return;
  try {
    const routine = await getRoutineByOid(req.params.oid);
    if (!routine) {
      if (typeof res.status === "function") res.status(404);
      return page(req, res, "Routine not found", `<div class="alert alert-warning">Routine not found in the current tenant schema.</div>`);
    }
    const body = `<p><a href="/db-code">← Back to DB Code</a></p>
<div class="mb-3">
  <a class="btn btn-primary" href="/db-code/routine/${routine.oid}/edit">Edit</a>
  <a class="btn btn-outline-danger" href="/db-code/routine/${routine.oid}/delete">Delete</a>
  <a class="btn btn-outline-secondary" href="/db-code/routine/${routine.oid}/execute">Test / execute</a>
</div>
<table class="table table-sm">
<tr><th>Schema</th><td>${escapeHtml(routine.schema)}</td></tr>
<tr><th>Name</th><td>${escapeHtml(routine.name)}</td></tr>
<tr><th>Type</th><td>${escapeHtml(routine.kind)}</td></tr>
<tr><th>Arguments</th><td><code>${escapeHtml(routine.arguments)}</code></td></tr>
<tr><th>Returns</th><td><code>${escapeHtml(routine.result_type || "")}</code></td></tr>
<tr><th>Language</th><td>${escapeHtml(routine.language)}</td></tr>
<tr><th>Volatility</th><td>${escapeHtml(routine.volatility || routine.provolatile)}</td></tr>
<tr><th>Security</th><td>${routine.prosecdef ? "SECURITY DEFINER" : "SECURITY INVOKER"}</td></tr>
<tr><th>Description</th><td>${escapeHtml(routine.description || "")}</td></tr>
</table>
<h2>Definition</h2>
<pre class="border rounded p-3 bg-light"><code>${escapeHtml(routine.definition)}</code></pre>`;
    page(req, res, `${routine.kind}: ${routine.name}`, body);
  } catch (error) {
    page(req, res, "DB Code", `<div class="alert alert-warning">${escapeHtml(error.message)}</div>`);
  }
}

module.exports = showRoute;
