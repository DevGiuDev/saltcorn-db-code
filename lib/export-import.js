/**
 * Export/import helpers for database routines.
 *
 * Pack format:
 * {
 *   format: "saltcorn-db-code-routines",
 *   version: 1,
 *   exported_at: "2026-05-09T...",
 *   source_schema: "public",
 *   routines: [
 *     {
 *       name: "hello",
 *       kind: "function",
 *       identity_arguments: "",
 *       arguments: "",
 *       result_type: "text",
 *       language: "sql",
 *       volatility: "IMMUTABLE",
 *       security_definer: false,
 *       input_args: [],
 *       description: "...",
 *       ddl: "CREATE OR REPLACE FUNCTION ..."
 *     }
 *   ]
 * }
 */

const {
  div, a, i, span, input, table, thead, tbody, tr, th, td,
  text, text_attr, script,
  kindBadge, languageBadge, code,
} = require("./markup-helpers");

const PACK_FORMAT = "saltcorn-db-code-routines";
const PACK_VERSION = 1;

/**
 * Build an export pack from an array of routine rows (as returned by listRoutines).
 * Each routine's `definition` (from pg_get_functiondef) is used as the DDL.
 */
function buildExportPack(routines, schema) {
  return {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    exported_at: new Date().toISOString(),
    source_schema: schema,
    routines: routines.map((r) => ({
      name: r.name,
      kind: r.kind,
      identity_arguments: r.identity_arguments || "",
      arguments: r.arguments || "",
      result_type: r.result_type || null,
      language: r.language || "plpgsql",
      volatility: r.volatility || "VOLATILE",
      security_definer: !!r.prosecdef,
      input_args: r.input_args || [],
      description: r.description || null,
      ddl: r.definition || "",
    })),
  };
}

/**
 * Validate an imported pack object.
 * Returns { valid: true, pack } or { valid: false, error: "..." }.
 */
function validateImportPack(raw) {
  if (!raw || typeof raw !== "object") {
    return { valid: false, error: "Invalid file: not a JSON object." };
  }
  if (raw.format !== PACK_FORMAT) {
    return { valid: false, error: `Unrecognised format "${raw.format || "(missing)"}". Expected "${PACK_FORMAT}".` };
  }
  if ((raw.version || 0) > PACK_VERSION) {
    return { valid: false, error: `Pack version ${raw.version} is newer than supported version ${PACK_VERSION}. Please update the DB Code plugin.` };
  }
  if (!Array.isArray(raw.routines)) {
    return { valid: false, error: "Pack has no routines array." };
  }
  for (let i = 0; i < raw.routines.length; i++) {
    const r = raw.routines[i];
    if (!r.name) return { valid: false, error: `Routine #${i + 1} has no name.` };
    if (!r.kind) return { valid: false, error: `Routine "${r.name}" has no kind.` };
    if (!r.ddl) return { valid: false, error: `Routine "${r.name}" has no DDL.` };
  }
  return { valid: true, pack: raw };
}

/**
 * Remap schema references in a DDL string from oldSchema to newSchema.
 * Simple string replacement of "oldSchema". and oldSchema. patterns.
 */
function remapSchemaInDdl(ddl, oldSchema, newSchema) {
  if (!ddl || oldSchema === newSchema) return ddl;
  const escapedOld = oldSchema.replace(/"/g, '""');
  let result = ddl;
  result = result.replace(new RegExp(`"${escapedOld.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\.`, "g"), `"${newSchema.replace(/"/g, '""')}".`);
  result = result.replace(new RegExp(`(?<!")\\b${oldSchema.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(?!")`, "g"), `${newSchema}.`);
  return result;
}

/**
 * Render an HTML table previewing the routines in a pack.
 */
function renderPackPreview(pack) {
  const routineRows = pack.routines.map((r, i) => {
    return tr(
      td(input({ class: "form-check-input", type: "checkbox", name: `import_${i}`, value: "1", checked: true })),
      td(kindBadge(r.kind)),
      td(code(text(r.name))),
      td(code(text(r.identity_arguments || "none"))),
      td(code(text(r.result_type || "\u2014"))),
      td(languageBadge(r.language || "")),
    );
  });

  return [
    div({ class: "table-responsive" },
      table({ class: "table table-sm table-hover align-middle mb-0" },
        thead(
          tr(
            th(input({ class: "form-check-input", type: "checkbox", id: "importToggleAll", checked: true })),
            th("Type"), th("Name"), th("Arguments"), th("Returns"), th("Language"),
          ),
        ),
        tbody(routineRows),
      ),
    ),
    div({ class: "small text-muted mt-2" },
      `${pack.routines.length} routine${pack.routines.length !== 1 ? "s" : ""} \u00b7 exported from schema `,
      code(text(pack.source_schema || "?")),
    ),
    script(`
(function(){
  var toggle = document.getElementById('importToggleAll');
  if (!toggle) return;
  var boxes = document.querySelectorAll('input[name^="import_"]');
  toggle.addEventListener('change', function(){
    boxes.forEach(function(b){ b.checked = toggle.checked; });
  });
})();
`),
  ].join("");
}

module.exports = { PACK_FORMAT, PACK_VERSION, buildExportPack, validateImportPack, remapSchemaInDdl, renderPackPreview };
