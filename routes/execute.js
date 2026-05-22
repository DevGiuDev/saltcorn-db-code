const db = require("@saltcorn/data/db");
const { requireAdmin } = require("../lib/auth");
const { page } = require("../lib/html");
const { ensurePostgres, getRoutineByOid } = require("../lib/introspection");
const { quoteIdent } = require("../lib/sql-builders");
const { coerceRoutineInputArgs, routineArity } = require("../lib/routine-args");
const { detailViewHref, viewContextInput, getViewBaseUrl } = require("../lib/view-context");

const {
  div, a, i, span, button, input, h5, form, label, textarea,
  select, option, text, text_attr, script,
  csrfInput, backLink, sectionTitle, errorAlert, notFoundAlert,
  identityTable, code, codeRef, shellStyles,
} = require("../lib/markup-helpers");

function argInputField(arg, index, required) {
  const label_ = text(arg.name || `arg${index + 1}`);
  const typeHint = text(arg.type || "text");
  const placeholder = `${arg.name || `arg${index + 1}`}: ${arg.type || "text"}`;
  const reqAttr = required ? { required: true } : {};
  const pgType = (arg.type || "").toLowerCase();
  let inputType = "text";
  let extraAttrs = "";
  if (pgType === "integer" || pgType === "bigint" || pgType === "smallint" || pgType === "int" || pgType === "serial" || pgType === "bigserial") {
    inputType = "number";
    extraAttrs = ' step="1"';
  } else if (pgType === "numeric" || pgType === "decimal" || pgType === "real" || pgType === "double precision") {
    inputType = "number";
  } else if (pgType === "boolean") {
    return div({ class: "col-md-6 mb-3" },
      label({ class: "form-label" }, label_, ` <code class="small">${typeHint}</code>`, required ? ' <span class="text-danger">*</span>' : ' <span class="text-muted">(optional)</span>'),
      select({ class: "form-select", name: `arg_${index}`, ...reqAttr },
        option({ value: "" }, "-- not provided --"),
        option({ value: "true" }, "true"),
        option({ value: "false" }, "false"),
      ),
    );
  }
  return div({ class: "col-md-6 mb-3" },
    label({ class: "form-label" }, label_, ` <code class="small">${typeHint}</code>`, required ? ' <span class="text-danger">*</span>' : ' <span class="text-muted">(optional)</span>'),
    `<input class="form-control" type="${inputType}" name="arg_${index}" placeholder="${text_attr(placeholder)}"${extraAttrs}${required ? " required" : ""}>`,
  );
}

function renderResultTable(rows) {
  if (!rows || rows.length === 0) {
    return div({ class: "text-muted text-center py-3" }, i({ class: "fas fa-check-circle text-success me-2" }), "Query returned no rows.");
  }
  const columns = Object.keys(rows[0]);
  const headerCells = columns.map((col) => th(text(col)));
  const bodyRows = rows.map((row) => {
    const cells = columns.map((col) => {
      const val = row[col];
      if (val === null) return td({ class: "text-muted fst-italic" }, "NULL");
      if (typeof val === "object") return td(code(text(JSON.stringify(val))));
      return td(text(String(val)));
    });
    return tr(cells);
  });
  return div({ class: "table-responsive" },
    table({ class: "table table-sm table-hover table-bordered result-table" },
      thead(tr(headerCells)),
      tbody(bodyRows),
    ),
  ) + div({ class: "small text-muted" }, `${rows.length} row${rows.length !== 1 ? "s" : ""}`);
}

function renderResultJson(data) {
  const json = JSON.stringify(data, null, 2);
  return div({ class: "result-json" }, preTag({ class: "border rounded p-3 bg-light mb-0" }, `<code>${text(json)}</code>`));
}

function renderError(message) {
  return div({ class: "alert alert-danger" },
    i({ class: "fas fa-exclamation-triangle me-2" }),
    "<strong>Execution error</strong>",
    `<pre class="mb-0 mt-2 small">${text(message)}</pre>`,
  );
}

function renderSuccessMeta(meta) {
  const parts = [];
  if (meta.kind) parts.push(span({ class: "badge bg-light text-dark border" }, text(meta.kind)));
  if (meta.rowCount != null) parts.push(span({ class: "badge bg-light text-dark border" }, `${meta.rowCount} row${meta.rowCount !== 1 ? "s" : ""}`));
  if (meta.durationMs != null) parts.push(span({ class: "badge bg-light text-dark border" }, `${meta.durationMs} ms`));
  return parts.length ? div({ class: "d-flex flex-wrap gap-1 mb-2" }, parts) : "";
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
    : div({ class: "text-muted" }, i({ class: "fas fa-info-circle me-1" }), `This ${routine.kind} takes no arguments.`);

  let resultSection = "";
  if (error) {
    resultSection = [sectionTitle("Result"), renderError(error)].join("");
  } else if (resultData) {
    const metaHtml = renderSuccessMeta(resultData.meta || {});
    const bodyHtml = resultData.rows ? renderResultTable(resultData.rows) : renderResultJson(resultData.data);
    resultSection = [sectionTitle("Result"), metaHtml, bodyHtml].join("");
  }

  return [
    shellStyles("execute", ".db-code-execute .db-code-execute-icon { width: 2.25rem; height: 2.25rem; display: inline-flex; align-items: center; justify-content: center; }\n.db-code-execute .form-section-title { font-size: .78rem; letter-spacing: .06em; text-transform: uppercase; color: var(--bs-secondary-color, #6c757d); font-weight: 700; margin-bottom: .75rem; }\n.db-code-execute .sticky-help { position: sticky; top: 1rem; }\n.db-code-execute .result-table th { white-space: nowrap; }\n.db-code-execute .result-json { max-height: 30rem; overflow: auto; }"),
    div({ class: "db-code-execute" },
      backLink(backHref, "Back to routine"),
      error && !resultData ? errorAlert(error) : "",
      div({ class: "card mt-0 card-max-full-screen" },
        div(
          { class: "card-header d-flex justify-content-between align-items-center flex-wrap" },
          div(
            { class: "d-flex align-items-center" },
            span({ class: "db-code-execute-icon rounded bg-success text-white me-2" }, i({ class: "fas fa-play" })),
            div(
              h5({ class: "mb-0" }, `Execute ${routine.kind}: `, text(routine.name)),
              div({ class: "small text-muted" }, `Run this ${routine.kind} with the provided arguments`),
            ),
          ),
          a({ class: "btn btn-sm btn-outline-secondary", href: backHref }, "Cancel"),
        ),
        div({ class: "card-body" },
          div({ class: "row g-4" },
            div({ class: "col-lg-8" },
              form({ method: "post", action: `/db-code/routine/${routine.oid}/execute` },
                csrfInput(req),
                viewContextInput(viewBaseUrl),
                sectionTitle("Arguments"),
                div({ class: "row" }, argFields),
                div({ class: "mb-3" },
                  button({ class: "btn btn-success", type: "submit" }, i({ class: "fas fa-play me-1" }), "Execute"),
                  a({ class: "btn btn-outline-secondary ms-2", href: backHref }, "Cancel"),
                ),
              ),
              resultSection,
            ),
            div({ class: "col-lg-4" },
              div({ class: "sticky-help" },
                identityTable(routine),
                div({ class: "card border-0 bg-light" },
                  div({ class: "card-body" },
                    sectionTitle("Notes"),
                    `<ul class="small mb-0">
<li>${isFunction ? "Functions are executed with <code>SELECT *</code>." : "Procedures are executed with <code>CALL</code>."}</li>
<li>Boolean fields use a tri-state selector (unset / true / false).</li>
<li>Null values are sent as SQL NULL.</li>
<li>Optional arguments with defaults may be left empty.</li>
<li>Read-only — this only calls the routine, does not modify its definition.</li>
</ul>`,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  ].join("");
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
      return page(req, res, "Routine not found", notFoundAlert());
    }
    if (!["function", "procedure"].includes(routine.kind)) {
      return page(req, res, "Cannot execute", div({ class: "alert alert-warning" }, `Execution is only supported for functions and procedures. This is a ${routine.kind}.`));
    }
    page(req, res, `Execute ${routine.kind}: ${routine.name}`, buildForm(req, routine, null, null, getViewBaseUrl(req)));
  } catch (error) {
    page(req, res, "Execute routine", errorAlert(error.message));
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
      return page(req, res, "Routine not found", notFoundAlert());
    }
    if (!["function", "procedure"].includes(routine.kind)) {
      return page(req, res, "Cannot execute", div({ class: "alert alert-warning" }, "Execution is only supported for functions and procedures."));
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
      page(req, res, "Execute routine", errorAlert(error.message));
    }
  }
}

// Need preTag for renderResultJson
const { pre: preTag } = require("../lib/markup-helpers");

module.exports = { executeFormRoute, executePostRoute, parseArgValue };
