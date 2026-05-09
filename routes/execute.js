const db = require("@saltcorn/data/db");
const { requireAdmin } = require("../lib/auth");
const { escapeHtml, page } = require("../lib/html");
const { ensurePostgres, getRoutineByOid } = require("../lib/introspection");
const { quoteIdent } = require("../lib/sql-builders");
const { coerceRoutineInputArgs, routineArity } = require("../lib/routine-args");
const { detailViewHref, viewContextInput, getViewBaseUrl } = require("../lib/view-context");

function csrfInput(req) {
  return typeof req.csrfToken === "function" ? `<input type="hidden" name="_csrf" value="${escapeHtml(req.csrfToken())}">` : "";
}

function formStyles() {
  return `<style>
.db-code-execute .db-code-execute-icon { width: 2.25rem; height: 2.25rem; display: inline-flex; align-items: center; justify-content: center; }
.db-code-execute .form-section-title { font-size: .78rem; letter-spacing: .06em; text-transform: uppercase; color: var(--bs-secondary-color, #6c757d); font-weight: 700; margin-bottom: .75rem; }
.db-code-execute .sticky-help { position: sticky; top: 1rem; }
.db-code-execute .result-table th { white-space: nowrap; }
.db-code-execute .result-json { max-height: 30rem; overflow: auto; }
</style>`;
}

function argInputField(arg, index, required) {
  const label = escapeHtml(arg.name || `arg${index + 1}`);
  const typeHint = escapeHtml(arg.type || "text");
  const placeholder = `${label}: ${typeHint}`;
  const reqAttr = required ? " required" : "";
  const pgType = (arg.type || "").toLowerCase();
  let inputType = "text";
  let extraAttrs = "";
  if (pgType === "integer" || pgType === "bigint" || pgType === "smallint" || pgType === "int" || pgType === "serial" || pgType === "bigserial") {
    inputType = "number";
    extraAttrs = ' step="1"';
  } else if (pgType === "numeric" || pgType === "decimal" || pgType === "real" || pgType === "double precision") {
    inputType = "number";
  } else if (pgType === "boolean") {
    return `<div class="col-md-6 mb-3">
  <label class="form-label">${label} <code class="small">${typeHint}</code>${required ? ' <span class="text-danger">*</span>' : ' <span class="text-muted">(optional)</span>'}</label>
  <select class="form-select" name="arg_${index}"${reqAttr}>
    <option value="">-- not provided --</option>
    <option value="true">true</option>
    <option value="false">false</option>
  </select>
</div>`;
  }
  return `<div class="col-md-6 mb-3">
  <label class="form-label">${label} <code class="small">${typeHint}</code>${required ? ' <span class="text-danger">*</span>' : ' <span class="text-muted">(optional)</span>'}</label>
  <input class="form-control" type="${inputType}" name="arg_${index}" placeholder="${placeholder}"${extraAttrs}${reqAttr}>
</div>`;
}

function identityCard(routine) {
  return `<div class="card bg-light border-0 mb-3"><div class="card-body">
<div class="form-section-title">Routine identity</div>
<table class="table table-sm mb-0">
  <tr><th>Name</th><td><code>${escapeHtml(routine.schema)}.${escapeHtml(routine.name)}</code></td></tr>
  <tr><th>Type</th><td>${escapeHtml(routine.kind)}</td></tr>
  <tr><th>Arguments</th><td><code>${escapeHtml(routine.identity_arguments || "none")}</code></td></tr>
  ${routine.result_type ? `<tr><th>Returns</th><td><code>${escapeHtml(routine.result_type)}</code></td></tr>` : ""}
  <tr><th>Language</th><td>${escapeHtml(routine.language || "")}</td></tr>
</table>
</div></div>`;
}

function renderResultTable(rows) {
  if (!rows || rows.length === 0) {
    return `<div class="text-muted text-center py-3"><i class="fas fa-check-circle text-success me-2"></i>Query returned no rows.</div>`;
  }
  const columns = Object.keys(rows[0]);
  const headerCells = columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("");
  const bodyRows = rows.map((row) => {
    const cells = columns.map((col) => {
      const val = row[col];
      if (val === null) return `<td class="text-muted fst-italic">NULL</td>`;
      if (typeof val === "object") return `<td><code>${escapeHtml(JSON.stringify(val))}</code></td>`;
      return `<td>${escapeHtml(String(val))}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<div class="table-responsive"><table class="table table-sm table-hover table-bordered result-table">
<thead><tr>${headerCells}</tr></thead>
<tbody>${bodyRows}</tbody>
</table></div>
<div class="small text-muted">${rows.length} row${rows.length !== 1 ? "s" : ""}</div>`;
}

function renderResultJson(data) {
  const json = JSON.stringify(data, null, 2);
  return `<div class="result-json"><pre class="border rounded p-3 bg-light mb-0"><code>${escapeHtml(json)}</code></pre></div>`;
}

function renderError(message) {
  return `<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i><strong>Execution error</strong><pre class="mb-0 mt-2 small">${escapeHtml(message)}</pre></div>`;
}

function renderSuccessMeta(meta) {
  const parts = [];
  if (meta.kind) parts.push(`<span class="badge bg-light text-dark border">${escapeHtml(meta.kind)}</span>`);
  if (meta.rowCount != null) parts.push(`<span class="badge bg-light text-dark border">${meta.rowCount} row${meta.rowCount !== 1 ? "s" : ""}</span>`);
  if (meta.durationMs != null) parts.push(`<span class="badge bg-light text-dark border">${meta.durationMs} ms</span>`);
  return parts.length ? `<div class="d-flex flex-wrap gap-1 mb-2">${parts.join("")}</div>` : "";
}

function buildForm(req, routine, error = null, resultData = null, viewBaseUrl = null) {
  const inputArgs = coerceRoutineInputArgs(routine);
  const { required } = routineArity(routine);
  const icon = routine.kind === "procedure" ? "fas fa-cogs" : "fas fa-cube";
  const isFunction = routine.kind === "function";
  const hasArgs = inputArgs.length > 0;
  const backHref = detailViewHref(viewBaseUrl, routine.oid);

  const argFields = hasArgs
    ? inputArgs.map((arg, i) => argInputField(arg, i, i < required)).join("\n")
    : `<div class="text-muted"><i class="fas fa-info-circle me-1"></i>This ${routine.kind} takes no arguments.</div>`;

  let resultSection = "";
  if (error) {
    resultSection = `<div class="form-section-title mt-4">Result</div>${renderError(error)}`;
  } else if (resultData) {
    const metaHtml = renderSuccessMeta(resultData.meta || {});
    const bodyHtml = resultData.rows ? renderResultTable(resultData.rows) : renderResultJson(resultData.data);
    resultSection = `<div class="form-section-title mt-4">Result</div>${metaHtml}${bodyHtml}`;
  }

  return `${formStyles()}<div class="db-code-execute">
<p><a class="text-decoration-none" href="${backHref}"><i class="fas fa-arrow-left me-1"></i>Back to routine</a></p>
${error && !resultData ? `<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>${escapeHtml(error)}</div>` : ""}
<div class="card mt-0 card-max-full-screen">
  <div class="card-header d-flex justify-content-between align-items-center flex-wrap">
    <div class="d-flex align-items-center">
      <span class="db-code-execute-icon rounded bg-success text-white me-2"><i class="fas fa-play"></i></span>
      <div>
        <h5 class="mb-0">Execute ${escapeHtml(routine.kind)}: ${escapeHtml(routine.name)}</h5>
        <div class="small text-muted">Run this ${escapeHtml(routine.kind)} with the provided arguments</div>
      </div>
    </div>
    <a class="btn btn-sm btn-outline-secondary" href="${backHref}">Cancel</a>
  </div>
  <div class="card-body">
    <div class="row g-4">
      <div class="col-lg-8">
        <form method="post" action="/db-code/routine/${routine.oid}/execute">
          ${csrfInput(req)}
          ${viewContextInput(viewBaseUrl)}
          <div class="form-section-title">Arguments</div>
          <div class="row">${argFields}</div>
          <div class="mb-3">
            <button class="btn btn-success" type="submit"><i class="fas fa-play me-1"></i>Execute</button>
            <a class="btn btn-outline-secondary ms-2" href="${backHref}">Cancel</a>
          </div>
        </form>
        ${resultSection}
      </div>
      <div class="col-lg-4"><div class="sticky-help">
        ${identityCard(routine)}
        <div class="card border-0 bg-light"><div class="card-body">
          <div class="form-section-title">Notes</div>
          <ul class="small mb-0">
            <li>${isFunction ? "Functions are executed with <code>SELECT *</code>." : "Procedures are executed with <code>CALL</code>."}</li>
            <li>Boolean fields use a tri-state selector (unset / true / false).</li>
            <li>Null values are sent as SQL NULL.</li>
            <li>Optional arguments with defaults may be left empty.</li>
            <li>Read-only — this only calls the routine, does not modify its definition.</li>
          </ul>
        </div></div>
      </div></div>
    </div>
  </div>
</div>
</div>`;
}

/**
 * Parse form-submitted argument values into typed JS values for parameterised queries.
 * Handles booleans, numbers, and null/empty → null.
 */
function parseArgValue(rawValue, pgType) {
  const str = String(rawValue ?? "").trim();
  if (str === "") return null;
  const pg = (pgType || "").toLowerCase();
  if (pg === "boolean") return str === "true";
  if (pg === "integer" || pg === "bigint" || pg === "smallint" || pg === "int" || pg === "serial" || pg === "bigserial") {
    const n = Number.parseInt(str, 10);
    return Number.isNaN(n) ? str : n;
  }
  if (pg === "numeric" || pg === "decimal" || pg === "real" || pg === "double precision") {
    const n = Number.parseFloat(str);
    return Number.isNaN(n) ? str : n;
  }
  if (pg === "jsonb" || pg === "json") {
    try { return JSON.parse(str); } catch { return str; }
  }
  return str;
}

async function executeFormRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    ensurePostgres();
    const routine = await getRoutineByOid(req.params.oid);
    if (!routine) {
      if (typeof res.status === "function") res.status(404);
      return page(req, res, "Routine not found", `<div class="alert alert-warning">Routine not found in the current tenant schema.</div>`);
    }
    if (!["function", "procedure"].includes(routine.kind)) {
      return page(req, res, "Cannot execute", `<div class="alert alert-warning">Execution is only supported for functions and procedures. This is a ${escapeHtml(routine.kind)}.</div>`);
    }
    page(req, res, `Execute ${routine.kind}: ${routine.name}`, buildForm(req, routine, null, null, getViewBaseUrl(req)));
  } catch (error) {
    page(req, res, "Execute routine", `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`);
  }
}

async function executePostRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  const viewBaseUrl = getViewBaseUrl(req);
  try {
    ensurePostgres();
    const routine = await getRoutineByOid(req.params.oid);
    if (!routine) {
      if (typeof res.status === "function") res.status(404);
      return page(req, res, "Routine not found", `<div class="alert alert-warning">Routine not found in the current tenant schema.</div>`);
    }
    if (!["function", "procedure"].includes(routine.kind)) {
      return page(req, res, "Cannot execute", `<div class="alert alert-warning">Execution is only supported for functions and procedures.</div>`);
    }

    const inputArgs = coerceRoutineInputArgs(routine);
    const { required } = routineArity(routine);

    const values = [];
    for (let i = 0; i < inputArgs.length; i++) {
      const raw = req.body?.[`arg_${i}`];
      if (i < required && (raw === undefined || raw === null || String(raw).trim() === "")) {
        return page(req, res, `Execute ${routine.kind}: ${routine.name}`, buildForm(req, routine, `Missing required argument: ${inputArgs[i].name || `#${i + 1}`}`, null, viewBaseUrl));
      }
      values.push(parseArgValue(raw, inputArgs[i]?.type));
    }

    const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
    const routineRef = `${quoteIdent(routine.schema)}.${quoteIdent(routine.name)}`;

    const start = Date.now();
    let result;
    if (routine.kind === "procedure") {
      result = await db.query(`CALL ${routineRef}(${placeholders})`, values);
    } else {
      result = await db.query(`SELECT * FROM ${routineRef}(${placeholders})`, values);
    }
    const durationMs = Date.now() - start;

    const resultData = routine.kind === "procedure"
      ? { meta: { kind: "procedure", rowCount: result.rowCount || 0, durationMs }, data: { success: true, rowCount: result.rowCount || 0 } }
      : { meta: { kind: "function", rowCount: result.rows?.length || 0, durationMs }, rows: result.rows || [] };

    page(req, res, `Execute ${routine.kind}: ${routine.name}`, buildForm(req, routine, null, resultData, viewBaseUrl));
  } catch (error) {
    const routine = await getRoutineByOid(req.params.oid).catch(() => null);
    if (routine) {
      page(req, res, `Execute ${routine.kind}: ${routine.name}`, buildForm(req, routine, error.message, null, viewBaseUrl));
    } else {
      page(req, res, "Execute routine", `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`);
    }
  }
}

module.exports = { executeFormRoute, executePostRoute, parseArgValue };
