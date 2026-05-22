/**
 * Renderers for the routine list and detail views.
 *
 * Uses @saltcorn/markup tag functions for HTML construction.
 */

const {
  div, a, i, span, button, input, h5, form, label, textarea,
  select, option, text, text_attr, script, style, ul, li, p, pre,
  table, thead, tbody, tr, th, td,
  sectionTitle, errorAlert, notFoundAlert, backLink,
  kindBadge, volatilityBadge, languageBadge, securityBadge,
  identityTable, code, codeRef,
  shellStyles,
} = require("./markup-helpers");

const { listRoutines, getRoutineByOid } = require("./introspection");
const { listViewHref, detailViewHref, routeHref, viewContextInput } = require("./view-context");

const KIND_OPTIONS = [
  { value: "", label: "All", icon: "fas fa-code" },
  { value: "function", label: "Functions", icon: "fas fa-cube" },
  { value: "procedure", label: "Stored procedures", icon: "fas fa-cogs" },
];

function unsupportedHtml(error) {
  return div({ class: "alert alert-warning" }, text(error.message || error));
}

function filterUrl(baseUrl, kind, viewBaseUrl) {
  if (viewBaseUrl) return listViewHref(viewBaseUrl, kind);
  const suffix = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  return `${baseUrl}${suffix}`;
}

async function renderRoutineList({ baseUrl = "/db-code", useViewState = false, showWriteActions = true, kind = "" } = {}) {
  const viewBaseUrl = useViewState ? baseUrl : null;
  try {
    const allRoutines = await listRoutines();
    const selectedKind = ["function", "procedure"].includes(kind) ? kind : "";
    const routines = selectedKind ? allRoutines.filter((routine) => routine.kind === selectedKind) : allRoutines;
    const functionCount = allRoutines.filter((r) => r.kind === "function").length;
    const procedureCount = allRoutines.filter((r) => r.kind === "procedure").length;
    const routineHref = (oid) => {
      return detailViewHref(viewBaseUrl, oid) + (selectedKind ? `&kind=${encodeURIComponent(selectedKind)}` : "");
    };

    const rows = routines.map((routine) => {
      const searchable = `${routine.name} ${routine.kind} ${routine.identity_arguments || ""} ${routine.result_type || ""} ${routine.language || ""}`.toLowerCase();
      return tr(
        {
          class: "db-code-row",
          "data-kind": text_attr(routine.kind),
          "data-searchable": text_attr(searchable),
        },
        td(kindBadge(routine.kind)),
        td(
          a({ class: "fw-bold text-decoration-none", href: routineHref(routine.oid) }, text(routine.name)),
          div({ class: "small text-muted" }, code(text(routine.schema), ".", text(routine.name))),
        ),
        td(code(text(routine.identity_arguments || ""))),
        td(code(text(routine.result_type || ""))),
        td(
          languageBadge(routine.language),
          volatilityBadge(routine.volatility),
          routine.prosecdef ? span({ class: "badge bg-danger" }, "SECURITY DEFINER") : "",
        ),
        td({ class: "text-nowrap" },
          a({ class: "btn btn-sm btn-outline-primary", href: routineHref(routine.oid) }, i({ class: "fas fa-eye me-1" }), "View"),
          " ",
          a({ class: "btn btn-sm btn-outline-secondary", href: routeHref(`/db-code/routine/${routine.oid}/edit`, viewBaseUrl) }, i({ class: "fas fa-edit me-1" }), "Edit"),
        ),
      );
    });

    const filterButtons = div(
      { class: "btn-group btn-group-sm", role: "group", "aria-label": "Routine type filters" },
      KIND_OPTIONS.map((opt) =>
        a(
          {
            class: ["btn", selectedKind === opt.value ? "btn-primary" : "btn-outline-primary"],
            href: filterUrl(baseUrl, opt.value, viewBaseUrl),
          },
          i({ class: `${opt.icon} me-1` }),
          text(opt.label),
        ),
      ),
    );

    const styles = style(`
.db-code-console .db-code-row td { vertical-align: middle; }
.db-code-console .db-code-toolbar { gap: .5rem; }
.db-code-console .db-code-stat { min-width: 8rem; }
.db-code-console .db-code-empty { min-height: 10rem; }
.db-code-console .table-responsive { border-radius: .375rem; }
`);

    const inlineScript = script(`
(function(){
  var root = document.currentScript.closest('.db-code-console');
  if (!root) return;
  var search = root.querySelector('.db-code-search');
  var rows = Array.from(root.querySelectorAll('.db-code-row'));
  var empty = root.querySelector('.db-code-empty');
  function applySearch(){
    var q = (search && search.value || '').toLowerCase().trim();
    var visible = 0;
    rows.forEach(function(row) {
      var ok = !q || (row.getAttribute('data-searchable') || '').includes(q);
      row.classList.toggle('d-none', !ok);
      if (ok) visible += 1;
    });
    if (empty) empty.classList.toggle('d-none', visible !== 0);
  }
  if (search) search.addEventListener('input', applySearch);
  applySearch();
})();
`);

    return [
      styles,
      div({ class: "db-code-console" },
        div({ class: "card mt-0 card-max-full-screen" },
          div(
            { class: "card-header d-flex justify-content-between align-items-center flex-wrap db-code-toolbar" },
            div(
              h5({ class: "mb-0" }, i({ class: "fas fa-database me-2" }), "DB Code Console"),
              div({ class: "small text-muted" }, "PostgreSQL functions and stored procedures in the current tenant schema"),
            ),
            showWriteActions
              ? div(
                  { class: "d-flex flex-wrap gap-1", role: "group", "aria-label": "Routine actions" },
                  div(
                    { class: "btn-group btn-group-sm", role: "group" },
                    a({ class: "btn btn-primary", href: routeHref("/db-code/new", viewBaseUrl) }, i({ class: "fas fa-plus me-1" }), "New function"),
                    a({ class: "btn btn-outline-primary", href: routeHref("/db-code/new-procedure", viewBaseUrl) }, i({ class: "fas fa-plus me-1" }), "New stored procedure"),
                    a({ class: "btn btn-outline-secondary", href: routeHref("/db-code/new-ddl", viewBaseUrl) }, i({ class: "fas fa-file-code me-1" }), "New from DDL"),
                  ),
                  div(
                    { class: "btn-group btn-group-sm", role: "group" },
                    a({ class: "btn btn-info text-white", href: routeHref("/db-code/export", viewBaseUrl) }, i({ class: "fas fa-download me-1" }), "Export"),
                    a({ class: "btn btn-outline-success", href: routeHref("/db-code/import", viewBaseUrl) }, i({ class: "fas fa-upload me-1" }), "Import"),
                  ),
                )
              : "",
          ),
          div({ class: "card-body" },
            div(
              { class: "d-flex flex-wrap align-items-center justify-content-between mb-3 db-code-toolbar" },
              div(
                { class: "d-flex flex-wrap align-items-center db-code-toolbar" },
                filterButtons,
                div(
                  { class: "input-group input-group-sm", style: "max-width: 320px;" },
                  span({ class: "input-group-text" }, i({ class: "fas fa-search" })),
                  input({ class: "form-control db-code-search", placeholder: "Search routines" }),
                ),
              ),
              div(
                { class: "d-flex flex-wrap db-code-toolbar small" },
                span({ class: "badge bg-secondary db-code-stat" }, `${allRoutines.length} routines`),
                span({ class: "badge bg-primary db-code-stat" }, `${functionCount} functions`),
                span({ class: "badge bg-warning text-dark db-code-stat" }, `${procedureCount} procedures`),
              ),
            ),
            div({ class: "table-responsive" },
              table({ class: "table table-sm table-hover align-middle mb-0" },
                thead(
                  tr(
                    th("Type"), th("Name"), th("Arguments"),
                    th("Returns"), th("Metadata"), th("Actions"),
                  ),
                ),
                tbody(rows),
              ),
            ),
            div({ class: `db-code-empty text-center text-muted py-5 ${rows.length ? "d-none" : ""}` },
              div({ class: "h5" }, "No routines found"),
              div("Try adjusting your search or filter options."),
            ),
          ),
        ),
        inlineScript,
      ),
    ].join("");
  } catch (error) {
    return unsupportedHtml(error);
  }
}

async function renderRoutineDetail(oid, { baseUrl = "/db-code", useViewState = false, showWriteActions = true, kind = "" } = {}) {
  const viewBaseUrl = useViewState ? baseUrl : null;
  try {
    const routine = await getRoutineByOid(oid);
    if (!routine) return notFoundAlert();

    const backHref = viewBaseUrl ? listViewHref(viewBaseUrl, kind) : baseUrl;
    const routineIcon = routine.kind === "procedure" ? "fas fa-cogs" : "fas fa-cube";

    const detailStyles = style(`
.db-code-detail .db-code-detail-icon { width: 2.25rem; height: 2.25rem; display: inline-flex; align-items: center; justify-content: center; }
.db-code-detail .db-code-toolbar { gap: .5rem; }
.db-code-detail .db-code-meta th { width: 38%; color: var(--bs-secondary-color, #6c757d); font-weight: 600; }
.db-code-detail .db-code-definition { max-height: 65vh; overflow: auto; }
.db-code-detail .db-code-definition textarea { border: none; background: transparent; }
.db-code-detail .db-code-definition .monaco-editor { border-radius: .375rem; }
.db-code-detail .sticky-meta { position: sticky; top: 1rem; }
`);

    const copyScript = script(`
(function(){
  var root = document.currentScript.closest('.db-code-detail');
  if (!root) return;
  var wrap = root.querySelector('.db-code-definition');
  function lockEditor() {
    var edta = wrap ? wrap.querySelector('textarea') : null;
    if (!edta) return;
    var m = edta.nextElementSibling;
    if (!m) return;
    var ed = $(m).data('monaco-editor');
    if (ed && ed.updateOptions) ed.updateOptions({ readOnly: true, domReadOnly: true });
  }
  lockEditor();
  setTimeout(lockEditor, 500);
  setTimeout(lockEditor, 1500);
  var btn = root.querySelector('.db-code-copy-definition');
  if (!btn || !wrap || !navigator.clipboard) return;
  btn.addEventListener('click', async function(){
    var edta2 = wrap.querySelector('textarea');
    var m2 = edta2 ? edta2.nextElementSibling : null;
    var ed2 = m2 ? $(m2).data('monaco-editor') : null;
    var text = '';
    if (ed2 && ed2.getModel) text = ed2.getModel().getValue();
    else if (edta2) text = edta2.value;
    else text = wrap.textContent || '';
    await navigator.clipboard.writeText(text);
    var old = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check me-1"></i>Copied';
    setTimeout(function(){ btn.innerHTML = old; }, 1200);
  });
})();
`);

    const securityBadgeHtml = securityBadge(routine.prosecdef);

    return [
      detailStyles,
      div({ class: "db-code-detail" },
        backLink(backHref),
        div({ class: "card mt-0 card-max-full-screen" },
          div(
            { class: "card-header d-flex justify-content-between align-items-center flex-wrap db-code-toolbar" },
            div(
              { class: "d-flex align-items-center" },
              span(
                { class: "db-code-detail-icon rounded bg-primary text-white me-2" },
                i({ class: routineIcon }),
              ),
              div(
                h5({ class: "mb-0" }, text(routine.name)),
                div({ class: "small text-muted" }, code(text(routine.schema), ".", text(routine.name), "(", text(routine.identity_arguments || ""), ")")),
              ),
            ),
            showWriteActions
              ? div(
                  { class: "btn-group btn-group-sm", role: "group", "aria-label": "Routine actions" },
                  a({ class: "btn btn-primary", href: routeHref(`/db-code/routine/${routine.oid}/edit`, viewBaseUrl) }, i({ class: "fas fa-edit me-1" }), "Edit"),
                  a({ class: "btn btn-outline-secondary", href: routeHref(`/db-code/routine/${routine.oid}/execute`, viewBaseUrl) }, i({ class: "fas fa-play me-1" }), "Test / execute"),
                  a({ class: "btn btn-outline-danger", href: routeHref(`/db-code/routine/${routine.oid}/delete`, viewBaseUrl) }, i({ class: "fas fa-trash me-1" }), "Delete"),
                )
              : "",
          ),
          div({ class: "card-body" },
            div({ class: "row g-4" },
              div({ class: "col-lg-8" },
                div(
                  { class: "d-flex justify-content-between align-items-center mb-2" },
                  div({ class: "form-section-title text-muted fw-bold text-uppercase small mb-0" }, "Definition"),
                  button({ type: "button", class: "btn btn-sm btn-outline-secondary db-code-copy-definition" }, i({ class: "fas fa-copy me-1" }), "Copy SQL"),
                ),
                div(
                  { class: "db-code-definition border rounded bg-light mb-0" },
                  textarea(
                    {
                      class: "to-code font-monospace",
                      mode: "text/x-sql",
                      readonly: true,
                      style: "width:100%;min-height:12rem;border:none;background:transparent;resize:vertical;",
                    },
                    text(routine.definition),
                  ),
                ),
              ),
              div({ class: "col-lg-4" },
                div({ class: "sticky-meta" },
                  div({ class: "card bg-light border-0 mb-3" },
                    div({ class: "card-body" },
                      div({ class: "form-section-title text-muted fw-bold text-uppercase small" }, "Metadata"),
                      div({ class: "mb-3 d-flex flex-wrap gap-1" },
                        kindBadge(routine.kind),
                        languageBadge(routine.language),
                        volatilityBadge(routine.volatility),
                        securityBadgeHtml,
                      ),
                      table({ class: "table table-sm db-code-meta mb-0" },
                        tbody(
                          tr(th("OID"), td(code(text(routine.oid)))),
                          tr(th("Schema"), td(code(text(routine.schema)))),
                          tr(th("Type"), td(text(routine.kind))),
                          tr(th("Arguments"), td(code(text(routine.arguments || "")))),
                          tr(th("Identity args"), td(code(text(routine.identity_arguments || "")))),
                          tr(th("Returns"), td(code(text(routine.result_type || "")))),
                        ),
                      ),
                    ),
                  ),
                  div({ class: "card border-0 bg-light" },
                    div({ class: "card-body" },
                      div({ class: "form-section-title text-muted fw-bold text-uppercase small" }, "Description"),
                      p({ class: "mb-0 small" }, text(routine.description || "No description set for this routine.")),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        copyScript,
      ),
    ].join("");
  } catch (error) {
    return unsupportedHtml(error);
  }
}

module.exports = { renderRoutineList, renderRoutineDetail };
