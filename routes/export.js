const { requireAdmin } = require("../lib/auth");
const { page } = require("../lib/html");
const { ensurePostgres, listRoutines, currentTenantSchema } = require("../lib/introspection");
const { buildExportPack } = require("../lib/export-import");
const { listViewHref, routeHref, viewContextInput, getViewBaseUrl } = require("../lib/view-context");

const {
  div, a, i, span, button, input, h5, form,
  table, thead, tbody, tr, th, td,
  text, text_attr, script,
  csrfInput, backLink, sectionTitle, errorAlert,
  kindBadge, languageBadge, code, codeRef, shellStyles,
} = require("../lib/markup-helpers");

function renderExportForm(req, routines, viewBaseUrl) {
  const backHref = listViewHref(viewBaseUrl);
  const routineRows = routines.map((r, idx) => {
    const kindClass = r.kind === "procedure" ? "bg-warning text-dark" : "bg-primary";
    return tr(
      td(input({ class: "form-check-input", type: "checkbox", name: `export_${idx}`, value: r.oid, checked: true })),
      td(span({ class: `badge ${kindClass}` }, i({ class: r.kind === "procedure" ? "fas fa-cogs me-1" : "fas fa-cube me-1" }), text(r.kind === "procedure" ? "Stored proc." : "Function"))),
      td(code(text(r.name))),
      td(code(text(r.identity_arguments || "none"))),
      td(code(text(r.result_type || "\u2014"))),
      td(languageBadge(r.language)),
    );
  });

  return [
    shellStyles("export", ".db-code-export .db-code-export-icon { width: 2.25rem; height: 2.25rem; display: inline-flex; align-items: center; justify-content: center; }\n.db-code-export .form-section-title { font-size: .78rem; letter-spacing: .06em; text-transform: uppercase; color: var(--bs-secondary-color, #6c757d); font-weight: 700; margin-bottom: .75rem; }"),
    div({ class: "db-code-export" },
      backLink(backHref),
      div({ class: "card mt-0 card-max-full-screen" },
        div(
          { class: "card-header d-flex justify-content-between align-items-center flex-wrap" },
          div(
            { class: "d-flex align-items-center" },
            span({ class: "db-code-export-icon rounded bg-info text-white me-2" }, i({ class: "fas fa-download" })),
            div(
              h5({ class: "mb-0" }, "Export routines"),
              div({ class: "small text-muted" }, "Download selected routines as a JSON pack"),
            ),
          ),
          a({ class: "btn btn-sm btn-outline-secondary", href: backHref }, "Cancel"),
        ),
        div({ class: "card-body" },
          form({ method: "post", action: "/db-code/export" },
            csrfInput(req),
            viewContextInput(viewBaseUrl),
            routines.length > 0
              ? div({ class: "table-responsive" },
                  `<table class="table table-sm table-hover align-middle mb-0">
<thead><tr>
  <th><input class="form-check-input" type="checkbox" id="exportToggleAll" checked></th>
  <th>Type</th><th>Name</th><th>Arguments</th><th>Returns</th><th>Language</th>
</tr></thead>
<tbody>${routineRows.join("")}</tbody>
</table>`,
                ) + script(`
(function(){
  var toggle = document.getElementById('exportToggleAll');
  if (!toggle) return;
  var boxes = document.querySelectorAll('input[name^="export_"]');
  toggle.addEventListener('change', function(){ boxes.forEach(function(b){ b.checked = toggle.checked; }); });
})();
`) + div({ class: "d-flex gap-2 mt-3" },
                  button({ class: "btn btn-info text-white", type: "submit" }, i({ class: "fas fa-download me-1" }), `Export ${routines.length} routine${routines.length !== 1 ? "s" : ""}`),
                  a({ class: "btn btn-outline-secondary", href: backHref }, "Cancel"),
                )
              : div({ class: "text-muted text-center py-4" }, i({ class: "fas fa-info-circle me-2" }), "No routines found to export."),
          ),
        ),
      ),
    ),
  ].join("");
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
    page(req, res, "Export routines", errorAlert(error.message));
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
    page(req, res, "Export routines", errorAlert(error.message));
  }
}

module.exports = { exportFormRoute, exportPostRoute };
