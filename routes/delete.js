const db = require("@saltcorn/data/db");
const { requireAdmin } = require("../lib/auth");
const { page } = require("../lib/html");
const { ensurePostgres, getRoutineByOid } = require("../lib/introspection");
const { buildDropRoutineSql } = require("../lib/sql-builders");
const { detailViewHref, listViewHref, viewContextInput, getViewBaseUrl } = require("../lib/view-context");

const {
  div, a, i, span, button, input, h5, form, label, pre: preTag,
  text, text_attr, style,
  csrfInput, backLink, sectionTitle, errorAlert, notFoundAlert,
  identityTable, code, codeRef, shellStyles,
} = require("../lib/markup-helpers");

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
    [parsedOid],
  );
  return rows;
}

function renderDeleteForm(req, routine, dependencies = [], error = null, viewBaseUrl = null) {
  const dropSql = buildDropRoutineSql({
    schema: routine.schema,
    name: routine.name,
    identityArguments: routine.identity_arguments || "",
    kind: routine.kind,
  });
  const hasDependencies = dependencies.length > 0;
  const backHref = detailViewHref(viewBaseUrl, routine.oid);

  return [
    shellStyles("delete", ".db-code-delete .db-code-delete-icon { width: 2.25rem; height: 2.25rem; display: inline-flex; align-items: center; justify-content: center; }\n.db-code-delete .form-section-title { font-size: .78rem; letter-spacing: .06em; text-transform: uppercase; color: var(--bs-secondary-color, #6c757d); font-weight: 700; margin-bottom: .75rem; }\n.db-code-delete .sticky-help { position: sticky; top: 1rem; }"),
    div({ class: "db-code-delete" },
      backLink(backHref, "Back to routine"),
      errorAlert(error),
      div({ class: "card mt-0" },
        div(
          { class: "card-header d-flex justify-content-between align-items-center flex-wrap" },
          div(
            { class: "d-flex align-items-center" },
            span({ class: "db-code-delete-icon rounded bg-danger text-white me-2" }, i({ class: "fas fa-trash" })),
            div(
              h5({ class: "mb-0" }, `Delete ${routine.kind}: `, text(routine.name)),
              div({ class: "small text-muted" }, "Drop this PostgreSQL routine from the current tenant schema"),
            ),
          ),
          a({ class: "btn btn-sm btn-outline-secondary", href: backHref }, "Cancel"),
        ),
        div({ class: "card-body" },
          div({ class: "row g-4" },
            div({ class: "col-lg-8" },
              div({ class: "alert alert-danger" },
                "<strong>This action cannot be undone.</strong> DB Code will execute a plain DROP statement without CASCADE.",
              ),
              sectionTitle("SQL to execute"),
              preTag({ class: "border rounded p-3 bg-light" }, `<code>${text(dropSql)}</code>`),
              form({ method: "post", action: `/db-code/routine/${routine.oid}/delete` },
                csrfInput(req),
                viewContextInput(viewBaseUrl),
                div({ class: "mb-3" },
                  label({ class: "form-label" }, "Type the routine name to confirm"),
                  input({ class: "form-control", name: "confirmName", required: true, autocomplete: "off", placeholder: text_attr(routine.name) }),
                ),
                div({ class: "d-flex gap-2" },
                  button({ class: "btn btn-danger", type: "submit" }, i({ class: "fas fa-trash me-1" }), "Delete routine"),
                  a({ class: "btn btn-outline-secondary", href: backHref }, "Cancel"),
                ),
              ),
            ),
            div({ class: "col-lg-4" },
              div({ class: "sticky-help" },
                div({ class: "card bg-light border-0 mb-3" },
                  div({ class: "card-body" },
                    sectionTitle("Routine identity"),
                    identityTable(routine, [
                      ["Schema", code(text(routine.schema))],
                    ]),
                  ),
                ),
                div(
                  { class: `card ${hasDependencies ? "border-warning" : "border-success"}` },
                  div({ class: "card-body" },
                    sectionTitle("Dependencies"),
                    hasDependencies
                      ? [
                          div({ class: "alert alert-warning py-2 small" }, "PostgreSQL may reject the drop because dependent objects exist. CASCADE is intentionally not used."),
                          `<ul class="small mb-0">${dependencies.map((dep) => `<li>${text(dep.dependent_object || dep.deptype)}</li>`).join("")}</ul>`,
                        ].join("")
                      : div({ class: "text-success small" }, i({ class: "fas fa-check me-1" }), "No direct dependencies found through pg_depend."),
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

async function deleteFormRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    ensurePostgres();
    const routine = await getRoutineByOid(req.params.oid);
    if (!routine) {
      if (typeof res.status === "function") res.status(404);
      return page(req, res, "Routine not found", notFoundAlert());
    }
    const dependencies = await getRoutineDependencies(routine.oid);
    page(req, res, `Delete ${routine.kind}: ${routine.name}`, renderDeleteForm(req, routine, dependencies, null, getViewBaseUrl(req)));
  } catch (error) {
    page(req, res, "Delete routine", errorAlert(error.message));
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
      return page(req, res, "Routine not found", notFoundAlert());
    }
    if ((req.body?.confirmName || "") !== routine.name) {
      const dependencies = await getRoutineDependencies(routine.oid);
      return page(req, res, `Delete ${routine.kind}: ${routine.name}`, renderDeleteForm(req, routine, dependencies, "Confirmation name does not match.", viewBaseUrl));
    }
    const dropSql = buildDropRoutineSql({
      schema: routine.schema,
      name: routine.name,
      identityArguments: routine.identity_arguments || "",
      kind: routine.kind,
    });
    await db.query(dropSql);
    if (typeof req.flash === "function") req.flash("success", `Routine ${routine.name} deleted`);
    res.redirect(listViewHref(viewBaseUrl, routine.kind === "procedure" ? "procedure" : "function"));
  } catch (error) {
    const routine = await getRoutineByOid(req.params.oid).catch(() => null);
    if (routine) {
      const dependencies = await getRoutineDependencies(routine.oid).catch(() => []);
      page(req, res, `Delete ${routine.kind}: ${routine.name}`, renderDeleteForm(req, routine, dependencies, error.message, viewBaseUrl));
    } else {
      page(req, res, "Delete routine", errorAlert(error.message));
    }
  }
}

module.exports = { deleteFormRoute, deletePostRoute, getRoutineDependencies };
