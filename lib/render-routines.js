const { escapeHtml } = require("./html");
const { listRoutines, getRoutineByOid } = require("./introspection");

const KIND_OPTIONS = [
  { value: "", label: "All routines" },
  { value: "function", label: "Functions" },
  { value: "procedure", label: "Stored procedures" }
];

function unsupportedHtml(error) {
  return `<div class="alert alert-warning">${escapeHtml(error.message || error)}</div>`;
}

function filterUrl(baseUrl, kind, useViewState) {
  const suffix = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  return `${baseUrl}${suffix}`;
}

async function renderRoutineList({ baseUrl = "/db-code", useViewState = false, showWriteActions = true, kind = "" } = {}) {
  try {
    const allRoutines = await listRoutines();
    const selectedKind = ["function", "procedure"].includes(kind) ? kind : "";
    const routines = selectedKind ? allRoutines.filter((routine) => routine.kind === selectedKind) : allRoutines;
    const routineHref = (oid) => {
      if (!useViewState) return `${baseUrl}/routine/${oid}`;
      const params = new URLSearchParams({ routine_oid: String(oid) });
      if (selectedKind) params.set("kind", selectedKind);
      return `${baseUrl}?${params.toString()}`;
    };
    const rows = routines.map((routine) => `<tr>
<td><a href="${routineHref(routine.oid)}">${escapeHtml(routine.name)}</a></td>
<td>${escapeHtml(routine.kind)}</td>
<td><code>${escapeHtml(routine.identity_arguments)}</code></td>
<td><code>${escapeHtml(routine.result_type || "")}</code></td>
<td>${escapeHtml(routine.language)}</td>
<td><a class="btn btn-sm btn-outline-primary" href="${routineHref(routine.oid)}">View</a></td>
</tr>`).join("");
    const filter = `<div class="mb-3 d-flex align-items-center gap-2">
<label class="form-label mb-0" for="db-code-kind-filter">Type</label>
<select id="db-code-kind-filter" class="form-select w-auto" onchange="window.location=this.value">
${KIND_OPTIONS.map((opt) => `<option value="${filterUrl(baseUrl, opt.value, useViewState)}"${selectedKind === opt.value ? " selected" : ""}>${escapeHtml(opt.label)}</option>`).join("")}
</select>
</div>`;
    return `<div class="db-code-plugin">
<p class="text-muted">PostgreSQL functions and stored procedures in the current Saltcorn tenant schema.</p>
${showWriteActions ? `<div class="mb-3 d-flex gap-2 flex-wrap"><a class="btn btn-primary" href="/db-code/new">New function</a><a class="btn btn-outline-primary" href="/db-code/new-procedure">New stored procedure</a><a class="btn btn-outline-secondary" href="/db-code/new-ddl">New from DDL</a></div>` : ""}
${filter}
<table class="table table-striped table-sm">
<thead><tr><th>Name</th><th>Type</th><th>Arguments</th><th>Returns</th><th>Language</th><th>Actions</th></tr></thead>
<tbody>${rows || `<tr><td colspan="6" class="text-muted">No routines found for this filter.</td></tr>`}</tbody>
</table>
</div>`;
  } catch (error) {
    return unsupportedHtml(error);
  }
}

async function renderRoutineDetail(oid, { baseUrl = "/db-code", useViewState = false, showWriteActions = true, kind = "" } = {}) {
  try {
    const routine = await getRoutineByOid(oid);
    if (!routine) return `<div class="alert alert-warning">Routine not found in the current tenant schema.</div>`;
    const backHref = useViewState ? filterUrl(baseUrl, kind, useViewState) : baseUrl;
    return `<div class="db-code-plugin">
<p><a href="${backHref}">← Back to DB Code</a></p>
${showWriteActions ? `<div class="mb-3">
  <a class="btn btn-primary" href="/db-code/routine/${routine.oid}/edit">Edit</a>
  <a class="btn btn-outline-danger" href="/db-code/routine/${routine.oid}/delete">Delete</a>
  <a class="btn btn-outline-secondary" href="/db-code/routine/${routine.oid}/execute">Test / execute</a>
</div>` : ""}
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
<pre class="border rounded p-3 bg-light"><code>${escapeHtml(routine.definition)}</code></pre>
</div>`;
  } catch (error) {
    return unsupportedHtml(error);
  }
}

module.exports = { renderRoutineList, renderRoutineDetail };
