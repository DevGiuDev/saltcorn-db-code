const db = require("@saltcorn/data/db");
const { requireAdmin } = require("../lib/auth");
const { page } = require("../lib/html");
const { currentTenantSchema, ensurePostgres } = require("../lib/introspection");
const { buildCreateFunctionSql, buildCreateProcedureSql, validateCreateRoutineDdl } = require("../lib/sql-builders");
const { assertSafeSqlFragment } = require("../lib/validation");
const { getState } = require("@saltcorn/data/db/state");
const { listViewHref, detailViewHref, viewContextInput, getViewBaseUrl } = require("../lib/view-context");

const {
  div, a, i, span, button, input, h5, form, label, textarea,
  select, option, text, text_attr, script, style,
  csrfInput, backLink, sectionTitle, errorAlert,
  helpCard, hasCopilot, aiModal, selectedAttr, shellStyles,
} = require("../lib/markup-helpers");

function fieldValue(body, name, fallback = "") {
  return typeof body?.[name] === "undefined" ? fallback : body[name];
}

const formCss = `
.db-code-form .card-header { gap: .75rem; }
.db-code-form .db-code-form-icon { width: 2.25rem; height: 2.25rem; display: inline-flex; align-items: center; justify-content: center; }
.db-code-form textarea.to-code + div, .db-code-form .monaco-editor { border-radius: .375rem; }
`;

function shell({ title, subtitle, icon, backHref = "/db-code", backLabel = "Back to DB Code", error, aside, body }) {
  return [
    shellStyles("form", formCss),
    div({ class: "db-code-form" },
      backLink(backHref, backLabel),
      errorAlert(error),
      div(
        { class: "card mt-0 card-max-full-screen" },
        div(
          { class: "card-header d-flex justify-content-between align-items-center flex-wrap" },
          div(
            { class: "d-flex align-items-center" },
            span({ class: "db-code-form-icon rounded bg-primary text-white me-2" }, i({ class: icon })),
            div(
              h5({ class: "mb-0" }, text(title)),
              div({ class: "small text-muted" }, text(subtitle)),
            ),
          ),
          a({ class: "btn btn-sm btn-outline-secondary", href: backHref }, "Cancel"),
        ),
        div({ class: "card-body" },
          div({ class: "row g-4" },
            div({ class: "col-lg-8" }, body),
            div({ class: "col-lg-4" }, div({ class: "sticky-help" }, aside)),
          ),
        ),
      ),
    ),
  ].join("");
}

function renderStructuredRoutineForm(req, routineType, values = {}, error = null, viewBaseUrl = null) {
  const isProcedure = routineType === "procedure";
  const language = fieldValue(values, "language", "plpgsql");
  const volatility = fieldValue(values, "volatility", "VOLATILE");
  const security = fieldValue(values, "security", "INVOKER");
  const title = isProcedure ? "New stored procedure" : "New function";
  const action = isProcedure ? "/db-code/new-procedure" : "/db-code/new";
  const objectLabel = isProcedure ? "stored procedure" : "function";
  const backHref = listViewHref(viewBaseUrl);
  const aside = helpCard([
    "The tenant schema is selected automatically and cannot be changed from the form.",
    "Use structured fields for safer routine creation. Use New from DDL only when you already trust the full SQL.",
    `For plpgsql, you may write a full BEGIN/END block or simple statements; simple bodies are wrapped automatically.`,
    isProcedure ? "Procedures are invoked with CALL and do not return a value directly." : "Functions are invoked with SELECT and require a return type.",
  ]);

  const body = [
    form({ method: "post", action },
      csrfInput(req),
      viewContextInput(viewBaseUrl),
      sectionTitle("Signature"),
      div({ class: "row g-3" },
        div({ class: "col-md-6" },
          label({ class: "form-label" }, `${isProcedure ? "Procedure" : "Function"} name`),
          input({
            class: "form-control", name: "name", required: true,
            pattern: "[A-Za-z_][A-Za-z0-9_]*",
            value: text_attr(fieldValue(values, "name")),
            placeholder: `my_${isProcedure ? "procedure" : "function"}`,
          }),
          div({ class: "form-text" }, "Letters, numbers, and underscores only."),
        ),
        div({ class: "col-md-6" },
          label({ class: "form-label" }, "Arguments"),
          input({
            class: "form-control", name: "argumentsSql",
            placeholder: "user_id integer, active boolean",
            value: text_attr(fieldValue(values, "argumentsSql")),
          }),
        ),
        isProcedure ? "" : div({ class: "col-md-6" },
          label({ class: "form-label" }, "Return type"),
          input({
            class: "form-control", name: "returnType", required: true,
            placeholder: "integer, text, jsonb, setof table_name",
            value: text_attr(fieldValue(values, "returnType")),
          }),
        ),
      ),
      "<hr>",
      sectionTitle("Execution properties"),
      div({ class: "row g-3" },
        div({ class: "col-md-4" },
          label({ class: "form-label" }, "Language"),
          select({ class: "form-select", name: "language" },
            option({ value: "plpgsql", ...selectedAttr(language, "plpgsql") }, "plpgsql"),
            option({ value: "sql", ...selectedAttr(language, "sql") }, "sql"),
          ),
        ),
        isProcedure ? "" : div({ class: "col-md-4" },
          label({ class: "form-label" }, "Volatility"),
          select({ class: "form-select", name: "volatility" },
            option({ value: "VOLATILE", ...selectedAttr(volatility, "VOLATILE") }, "VOLATILE"),
            option({ value: "STABLE", ...selectedAttr(volatility, "STABLE") }, "STABLE"),
            option({ value: "IMMUTABLE", ...selectedAttr(volatility, "IMMUTABLE") }, "IMMUTABLE"),
          ),
        ),
        div({ class: "col-md-4" },
          label({ class: "form-label" }, "Security"),
          select({ class: "form-select", name: "security" },
            option({ value: "INVOKER", ...selectedAttr(security, "INVOKER") }, "INVOKER"),
            option({ value: "DEFINER", ...selectedAttr(security, "DEFINER") }, "DEFINER"),
          ),
        ),
      ),
      "<hr>",
      sectionTitle("Code"),
      div({ class: "mb-3" },
        label({ class: "form-label" }, `${isProcedure ? "Procedure" : "Function"} body`),
        textarea(
          { class: "form-control to-code font-monospace", mode: "text/x-sql", name: "body", rows: "14", required: true },
          text(fieldValue(values, "body")),
        ),
        div({ class: "form-text" }, `Do not include CREATE ${isProcedure ? "PROCEDURE" : "FUNCTION"} or dollar-quote delimiters.`),
        hasCopilot() ? aiModal("body", isProcedure ? "stored procedure" : "function") : "",
      ),
      div({ class: "mb-3" },
        label({ class: "form-label" }, "Description"),
        input({
          class: "form-control", name: "description",
          value: text_attr(fieldValue(values, "description")),
          placeholder: "Optional routine description",
        }),
      ),
      div({ class: "d-flex gap-2" },
        button({ class: "btn btn-primary", type: "submit" }, i({ class: "fas fa-save me-1" }), `Create ${objectLabel}`),
        a({ class: "btn btn-outline-secondary", href: backHref }, "Cancel"),
      ),
    ),
  ].join("");

  return shell({
    title,
    subtitle: `Create a PostgreSQL ${objectLabel} in the current tenant schema`,
    icon: isProcedure ? "fas fa-cogs" : "fas fa-cube",
    error,
    aside,
    backHref,
    body,
  });
}

function renderDdlForm(req, values = {}, error = null, viewBaseUrl = null) {
  const backHref = listViewHref(viewBaseUrl);
  const aside = helpCard([
    "DDL mode is intended for trusted SQL you already have.",
    "The statement must start with CREATE FUNCTION or CREATE PROCEDURE.",
    "The routine must be created explicitly in the current tenant schema.",
    "Use structured forms when possible; they apply stronger validation.",
  ], "DDL mode executes administrator-provided SQL.");

  const body = [
    form({ method: "post", action: "/db-code/new-ddl" },
      csrfInput(req),
      viewContextInput(viewBaseUrl),
      sectionTitle("Full DDL"),
      div({ class: "mb-3" },
        label({ class: "form-label" }, "CREATE FUNCTION / CREATE PROCEDURE DDL"),
        textarea(
          { class: "form-control to-code font-monospace", mode: "text/x-sql", name: "ddl", rows: "22", required: true },
          text(fieldValue(values, "ddl")),
        ),
        hasCopilot() ? aiModal("ddl", "function or stored procedure") : "",
      ),
      div({ class: "d-flex gap-2" },
        button({ class: "btn btn-primary", type: "submit" }, i({ class: "fas fa-file-code me-1" }), "Create from DDL"),
        a({ class: "btn btn-outline-secondary", href: backHref }, "Cancel"),
      ),
    ),
  ].join("");

  return shell({
    title: "New from DDL",
    subtitle: "Create a function or stored procedure from full PostgreSQL DDL",
    icon: "fas fa-file-code",
    error,
    aside,
    backHref,
    body,
  });
}

async function createFormRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  page(req, res, "New function", renderStructuredRoutineForm(req, "function", {}, null, getViewBaseUrl(req)));
}

async function createProcedureFormRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  page(req, res, "New stored procedure", renderStructuredRoutineForm(req, "procedure", {}, null, getViewBaseUrl(req)));
}

async function createDdlFormRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  page(req, res, "New from DDL", renderDdlForm(req, {}, null, getViewBaseUrl(req)));
}

async function createPostRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  const values = req.body || {};
  const viewBaseUrl = getViewBaseUrl(req);
  try {
    ensurePostgres();
    const argumentsSql = assertSafeSqlFragment(values.argumentsSql, "Arguments");
    const returnType = assertSafeSqlFragment(values.returnType, "Return type", { required: true });
    const sql = buildCreateFunctionSql({ schema: currentTenantSchema(), name: values.name, argumentsSql, returnType, language: values.language || "plpgsql", volatility: values.volatility || "VOLATILE", security: values.security || "INVOKER", body: values.body || "", description: values.description || "" });
    await db.query(sql);
    if (typeof req.flash === "function") req.flash("success", `Function ${values.name} created`);
    res.redirect(listViewHref(viewBaseUrl, "function"));
  } catch (error) {
    page(req, res, "New function", renderStructuredRoutineForm(req, "function", values, error.message, viewBaseUrl));
  }
}

async function createProcedurePostRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  const values = req.body || {};
  const viewBaseUrl = getViewBaseUrl(req);
  try {
    ensurePostgres();
    const argumentsSql = assertSafeSqlFragment(values.argumentsSql, "Arguments");
    const sql = buildCreateProcedureSql({ schema: currentTenantSchema(), name: values.name, argumentsSql, language: values.language || "plpgsql", security: values.security || "INVOKER", body: values.body || "", description: values.description || "" });
    await db.query(sql);
    if (typeof req.flash === "function") req.flash("success", `Stored procedure ${values.name} created`);
    res.redirect(listViewHref(viewBaseUrl, "procedure"));
  } catch (error) {
    page(req, res, "New stored procedure", renderStructuredRoutineForm(req, "procedure", values, error.message, viewBaseUrl));
  }
}

async function createDdlPostRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  const values = req.body || {};
  const viewBaseUrl = getViewBaseUrl(req);
  try {
    ensurePostgres();
    const ddl = validateCreateRoutineDdl(values.ddl, currentTenantSchema());
    await db.query(ddl);
    if (typeof req.flash === "function") req.flash("success", "Routine created from DDL");
    res.redirect(listViewHref(viewBaseUrl));
  } catch (error) {
    page(req, res, "New from DDL", renderDdlForm(req, values, error.message, viewBaseUrl));
  }
}

module.exports = { createFormRoute, createPostRoute, createProcedureFormRoute, createProcedurePostRoute, createDdlFormRoute, createDdlPostRoute };
