/**
 * Shared markup helpers used across route files.
 *
 * Consolidates functions that were previously duplicated in each route:
 * csrfInput, backLink, helpCard, shell, formStyles, hasCopilot, aiModal.
 */

const { getState } = require("@saltcorn/data/db/state");
const {
  div, a, i, span, button, input, h5, form, label, textarea,
  select, option, text, text_attr, script, domReady, style,
} = require("./markup");

/* ------------------------------------------------------------------ */
/*  CSRF                                                               */
/* ------------------------------------------------------------------ */

function csrfInput(req) {
  if (typeof req.csrfToken !== "function") return "";
  return input({ type: "hidden", name: "_csrf", value: text_attr(req.csrfToken()) });
}

/* ------------------------------------------------------------------ */
/*  Back link                                                          */
/* ------------------------------------------------------------------ */

function backLink(href, label = "Back to DB Code") {
  return a(
    { class: "text-decoration-none", href },
    i({ class: "fas fa-arrow-left me-1" }),
    text(label),
  );
}

/* ------------------------------------------------------------------ */
/*  Section title                                                      */
/* ------------------------------------------------------------------ */

function sectionTitle(label) {
  return div({ class: "form-section-title" }, text(label));
}

/* ------------------------------------------------------------------ */
/*  Error alert                                                        */
/* ------------------------------------------------------------------ */

function errorAlert(error) {
  if (!error) return "";
  return div(
    { class: "alert alert-danger" },
    i({ class: "fas fa-exclamation-triangle me-2" }),
    text(error),
  );
}

/* ------------------------------------------------------------------ */
/*  Info / warning alerts                                              */
/* ------------------------------------------------------------------ */

function infoAlert(msg) {
  return div({ class: "alert alert-info" }, text(msg));
}

function warningAlert(msg, small = false) {
  return div(
    { class: ["alert", "alert-warning", small && "py-2", small && "small"] },
    text(msg),
  );
}

function notFoundAlert(msg = "Routine not found in the current tenant schema.") {
  return div({ class: "alert alert-warning" }, text(msg));
}

/* ------------------------------------------------------------------ */
/*  Shell (shared card layout)                                         */
/* ------------------------------------------------------------------ */

function shellCssClass(prefix) {
  return `db-code-${prefix}`;
}

function shellStyles(prefix, extraCss = "") {
  return style(`
.db-code-${prefix} .${shellCssClass(prefix)}-icon { width: 2.25rem; height: 2.25rem; display: inline-flex; align-items: center; justify-content: center; }
.db-code-${prefix} .form-section-title { font-size: .78rem; letter-spacing: .06em; text-transform: uppercase; color: var(--bs-secondary-color, #6c757d); font-weight: 700; margin-bottom: .75rem; }
.db-code-${prefix} .sticky-help { position: sticky; top: 1rem; }
${extraCss}
`);
}

function cardHeader(iconClass, iconBg, title, subtitle, cancelHref) {
  return div(
    { class: "card-header d-flex justify-content-between align-items-center flex-wrap" },
    div(
      { class: "d-flex align-items-center" },
      span(
        { class: `${shellCssClass("form")}-icon rounded bg-${iconBg} text-white me-2` },
        i({ class: iconClass }),
      ),
      div(
        h5({ class: "mb-0" }, text(title)),
        div({ class: "small text-muted" }, text(subtitle)),
      ),
    ),
    a({ class: "btn btn-sm btn-outline-secondary", href: cancelHref }, "Cancel"),
  );
}

/* ------------------------------------------------------------------ */
/*  helpCard                                                           */
/* ------------------------------------------------------------------ */

function helpCard(items, warning = null) {
  return div(
    { class: "card bg-light border-0" },
    div(
      { class: "card-body" },
      sectionTitle("Guidance"),
      warning ? warningAlert(warning, true) : "",
      items.length
        ? ul({ class: "small mb-0" }, items.map((item) => li(item)))
        : "",
    ),
  );
}

/* ------------------------------------------------------------------ */
/*  Copilot / AI modal                                                 */
/* ------------------------------------------------------------------ */

function hasCopilot() {
  return !!getState()?.functions?.copilot_generate_javascript;
}

function aiModal(targetField, routineType) {
  return [
    button(
      {
        class: "btn btn-outline-secondary btn-sm mt-2",
        type: "button",
        onclick: "showDbCodeAiModal()",
      },
      i({ class: "fas fa-wand-magic-sparkles me-1" }),
      "Edit with AI",
    ),
    div(
      { class: "modal fade", id: "dbCodeAiModal", tabindex: "-1" },
      div(
        { class: "modal-dialog" },
        div(
          { class: "modal-content" },
          div(
            { class: "modal-header" },
            h5({ class: "modal-title" }, "Edit with AI"),
            button({ type: "button", class: "btn-close", "data-bs-dismiss": "modal" }),
          ),
          div(
            { class: "modal-body" },
            p({ class: "text-muted small" }, `Describe the ${routineType} you want to generate.`),
            textarea({
              id: "dbCodeAiPrompt",
              class: "form-control",
              rows: "4",
              placeholder: `Create a ${routineType} that ...`,
            }),
            div({ id: "dbCodeAiError", class: "alert alert-danger mt-2 mb-0 d-none" }),
          ),
          div(
            { class: "modal-footer" },
            button({ class: "btn btn-secondary", "data-bs-dismiss": "modal" }, "Cancel"),
            button({ id: "dbCodeAiGenBtn", class: "btn btn-primary", onclick: "runDbCodeAi()", disabled: true }, "Generate"),
          ),
        ),
      ),
    ),
    script(domReady(`
      function showDbCodeAiModal(){ new bootstrap.Modal(document.getElementById('dbCodeAiModal')).show(); }
      var ta=document.getElementById('dbCodeAiPrompt'); var btn=document.getElementById('dbCodeAiGenBtn');
      if(ta&&btn) ta.addEventListener('input', function(){ btn.disabled=!ta.value.trim(); });
    `)),
    script(`
function runDbCodeAi(){
  var ta=document.getElementById('dbCodeAiPrompt'); var prompt=ta.value.trim(); if(!prompt) return;
  var btn=document.getElementById('dbCodeAiGenBtn'); var err=document.getElementById('dbCodeAiError');
  btn.disabled=true; btn.textContent='Generating...'; err.classList.add('d-none');
  var edta=document.querySelector('textarea[name="${targetField}"]');
  var existing=edta?edta.value:'';
  fetch('/db-code/ai/generate-sql',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest','CSRF-Token':_sc_globalCsrf},body:JSON.stringify({description:prompt,existing_code:existing,routine_type:${JSON.stringify(routineType)}})})
    .then(r=>r.json()).then(data=>{
      btn.textContent='Generate';
      if(data.error){ err.textContent=data.error; err.classList.remove('d-none'); btn.disabled=!ta.value.trim(); return; }
      if(edta){ var m=edta.nextElementSibling; if(m){ var e=$(m).data('monaco-editor'); if(e) e.setValue(data.code); else edta.value=data.code; } else edta.value=data.code; }
      ta.value=''; btn.disabled=true; bootstrap.Modal.getInstance(document.getElementById('dbCodeAiModal')).hide();
    }).catch(e=>{ btn.textContent='Generate'; btn.disabled=!ta.value.trim(); err.textContent=e.message||'Generation failed'; err.classList.remove('d-none'); });
}
    `),
  ].join("");
}

/* ------------------------------------------------------------------ */
/*  select helper                                                      */
/* ------------------------------------------------------------------ */

function selectedAttr(value, expected) {
  return value === expected ? { selected: true } : {};
}

/* ------------------------------------------------------------------ */
/*  Badge helpers                                                      */
/* ------------------------------------------------------------------ */

function kindBadge(kind) {
  if (kind === "procedure") {
    return span(
      { class: "badge bg-warning text-dark" },
      i({ class: "fas fa-cogs me-1" }),
      "Stored procedure",
    );
  }
  return span(
    { class: "badge bg-primary" },
    i({ class: "fas fa-cube me-1" }),
    "Function",
  );
}

function volatilityBadge(volatility) {
  if (!volatility) return "";
  const klass = volatility === "IMMUTABLE" ? "bg-success" : volatility === "STABLE" ? "bg-info text-dark" : "bg-secondary";
  return span({ class: `badge ${klass} me-1` }, text(volatility));
}

function languageBadge(language) {
  return span({ class: "badge bg-light text-dark border" }, text(language));
}

function securityBadge(prosecdef) {
  if (prosecdef) {
    return span({ class: "badge bg-danger" }, i({ class: "fas fa-user-shield me-1" }), "SECURITY DEFINER");
  }
  return span({ class: "badge bg-light text-dark border" }, i({ class: "fas fa-user me-1" }), "SECURITY INVOKER");
}

/* ------------------------------------------------------------------ */
/*  Identity table (used in detail, edit, delete, execute)             */
/* ------------------------------------------------------------------ */

function identityTable(routine, fields = []) {
  const defaultFields = [
    ["Name", codeRef(routine.schema, routine.name)],
    ["Type", text(routine.kind)],
    ["Arguments", code(routine.identity_arguments || "none")],
  ];
  if (routine.result_type) {
    defaultFields.push(["Returns", code(routine.result_type)]);
  }
  if (routine.language) {
    defaultFields.push(["Language", text(routine.language)]);
  }
  const allFields = [...defaultFields, ...fields];
  return table(
    { class: "table table-sm mb-0" },
    tbody(
      allFields.map(([label, value]) =>
        tr(th(label), td(value)),
      ),
    ),
  );
}

/* ------------------------------------------------------------------ */
/*  HTML primitives                                                    */
/* ------------------------------------------------------------------ */

function code(...content) {
  return `<code>${content.join("")}</code>`;
}

function codeRef(schema, name) {
  return code(text(schema), ".", text(name));
}

// Re-export tag functions needed in route templates
const { ul, li, p, pre, table, thead, tbody, tr, th, td, option: _opt } = require("./markup");

module.exports = {
  // Tag re-exports
  div, a, i, span, button, input, h5, form, label, textarea,
  select, option, text, text_attr, script, style, ul, li, p, pre,
  table, thead, tbody, tr, th, td,

  // Helpers
  csrfInput,
  backLink,
  sectionTitle,
  errorAlert,
  infoAlert,
  warningAlert,
  notFoundAlert,
  shellCssClass,
  shellStyles,
  cardHeader,
  helpCard,
  hasCopilot,
  aiModal,
  selectedAttr,
  kindBadge,
  volatilityBadge,
  languageBadge,
  securityBadge,
  identityTable,
  code,
  codeRef,
};
