const db = require("@saltcorn/data/db");
const { requireAdmin } = require("../lib/auth");
const { page } = require("../lib/html");
const { currentTenantSchema, ensurePostgres, getRoutineByOid } = require("../lib/introspection");
const { validateCreateRoutineDdl } = require("../lib/sql-builders");
const { getState } = require("@saltcorn/data/db/state");
const { detailViewHref, listViewHref, viewContextInput, getViewBaseUrl } = require("../lib/view-context");

const {
  div, a, i, span, button, input, h5, form, label, textarea,
  text, text_attr, script,
  csrfInput, backLink, sectionTitle, errorAlert, notFoundAlert,
  helpCard, hasCopilot, aiModal, identityTable, code, codeRef,
  shellStyles,
} = require("../lib/markup-helpers");

function editHelpCard(routine) {
  return div(
    { class: "card bg-light border-0" },
    div(
      { class: "card-body" },
      sectionTitle("Routine identity"),
      identityTable(routine),
      div({ class: "alert alert-warning py-2 small" }, "Editing runs the DDL below. Keep the same routine identity unless you intentionally want PostgreSQL to create a different overload."),
      `<ul class="small mb-0">
<li>Changing a function return type may require dropping and recreating it.</li>
<li>The edited DDL must target the current tenant schema.</li>
<li>Use CREATE OR REPLACE for safer iterative edits.</li>
</ul>`,
    ),
  );
}

function renderEditForm(req, routine, values = {}, error = null, viewBaseUrl = null) {
  const ddl = typeof values.ddl === "undefined" ? routine.definition : values.ddl;
  const icon = routine.kind === "procedure" ? "fas fa-cogs" : "fas fa-cube";
  const backHref = detailViewHref(viewBaseUrl, routine.oid);

  return [
    shellStyles("form", ".db-code-form .form-section-title { font-size: .78rem; letter-spacing: .06em; text-transform: uppercase; color: var(--bs-secondary-color, #6c757d); font-weight: 700; margin-bottom: .75rem; }\n.db-code-form .sticky-help { position: sticky; top: 1rem; }"),
    div({ class: "db-code-form" },
      backLink(backHref, "Back to routine"),
      errorAlert(error),
      div(
        { class: "card mt-0 card-max-full-screen" },
        div(
          { class: "card-header d-flex justify-content-between align-items-center flex-wrap" },
          div(
            { class: "d-flex align-items-center" },
            span({ class: "db-code-form-icon rounded bg-primary text-white me-2" }, i({ class: icon })),
            div(
              h5({ class: "mb-0" }, `Edit ${routine.kind}: `, text(routine.name)),
              div({ class: "small text-muted" }, "Modify the PostgreSQL DDL for this routine"),
            ),
          ),
          a({ class: "btn btn-sm btn-outline-secondary", href: backHref }, "Cancel"),
        ),
        div({ class: "card-body" },
          div({ class: "row g-4" },
            div({ class: "col-lg-8" },
              form({ method: "post", action: `/db-code/routine/${routine.oid}/edit` },
                csrfInput(req),
                viewContextInput(viewBaseUrl),
                sectionTitle("Routine DDL"),
                div({ class: "mb-3" },
                  textarea(
                    { class: "form-control to-code font-monospace", mode: "text/x-sql", name: "ddl", rows: "24", required: true },
                    text(ddl),
                  ),
                  hasCopilot() ? aiModal("ddl", routine.kind) : "",
                ),
                div({ class: "d-flex gap-2" },
                  button({ class: "btn btn-primary", type: "submit" }, i({ class: "fas fa-save me-1" }), "Save routine"),
                  a({ class: "btn btn-outline-secondary", href: backHref }, "Cancel"),
                ),
              ),
            ),
            div({ class: "col-lg-4" },
              div({ class: "sticky-help" }, editHelpCard(routine)),
            ),
          ),
        ),
      ),
    ),
  ].join("");
}

async function editFormRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    ensurePostgres();
    const routine = await getRoutineByOid(req.params.oid);
    if (!routine) {
      if (typeof res.status === "function") res.status(404);
      return page(req, res, "Routine not found", notFoundAlert());
    }
    page(req, res, `Edit ${routine.kind}: ${routine.name}`, renderEditForm(req, routine, {}, null, getViewBaseUrl(req)));
  } catch (error) {
    page(req, res, "Edit routine", errorAlert(error.message));
  }
}

async function editPostRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  const values = req.body || {};
  const viewBaseUrl = getViewBaseUrl(req);
  try {
    ensurePostgres();
    const routine = await getRoutineByOid(req.params.oid);
    if (!routine) {
      if (typeof res.status === "function") res.status(404);
      return page(req, res, "Routine not found", notFoundAlert());
    }
    const ddl = validateCreateRoutineDdl(values.ddl, currentTenantSchema());
    await db.query(ddl);
    if (typeof req.flash === "function") req.flash("success", `Routine ${routine.name} saved`);
    res.redirect(detailViewHref(viewBaseUrl, routine.oid));
  } catch (error) {
    const routine = await getRoutineByOid(req.params.oid).catch(() => null);
    if (routine) page(req, res, `Edit ${routine.kind}: ${routine.name}`, renderEditForm(req, routine, values, error.message, viewBaseUrl));
    else page(req, res, "Edit routine", errorAlert(error.message));
  }
}

module.exports = { editFormRoute, editPostRoute };
