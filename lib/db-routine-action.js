const db = require("@saltcorn/data/db");
const { listRoutines, getRoutineByOid } = require("./introspection");
const { quoteIdent } = require("./sql-builders");
const { routineArity } = require("./routine-args");

function placeholders(count) {
  return Array.from({ length: count }, (_, index) => `$${index + 1}`).join(", ");
}

async function callRoutine({ routineOid, argumentsJson, row, user, configuration }) {
  const routine = await getRoutineByOid(routineOid);
  if (!routine) throw new Error("Configured DB routine was not found in the current tenant schema.");
  if (!["function", "procedure"].includes(routine.kind)) throw new Error("DB_Routine only supports functions and procedures.");

  const values = parseAndValidateArgs(argumentsJson, routine, { row, user, configuration });
  const routineRef = `${quoteIdent(routine.schema)}.${quoteIdent(routine.name)}`;
  if (routine.kind === "procedure") {
    const result = await db.query(`CALL ${routineRef}(${placeholders(values.length)})`, values);
    return { success: true, kind: routine.kind, routine: routine.name, rowCount: result.rowCount || 0 };
  }

  const result = await db.query(`SELECT * FROM ${routineRef}(${placeholders(values.length)})`, values);
  return { success: true, kind: routine.kind, routine: routine.name, rows: result.rows || [], rowCount: result.rowCount || 0 };
}

function resolveTemplateValue(value, context) {
  if (Array.isArray(value)) return value.map((item) => resolveTemplateValue(item, context));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveTemplateValue(v, context)]));
  }
  if (typeof value !== "string") return value;
  return value.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/g, (match) => match);
}

function parseAndValidateArgs(argumentsJson, routine, context) {
  const text = String(argumentsJson || "").trim();
  const { required, total } = routineArity(routine);

  if (!text) {
    if (required > 0) {
      throw new Error(
        `Routine "${routine.name}" requires ${required} argument${required > 1 ? "s" : ""} (${routine.identity_arguments}) but none were provided.`
      );
    }
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`Arguments JSON is not valid JSON: ${e.message}`);
  }

  if (Array.isArray(parsed)) {
    const count = parsed.length;
    if (count < required) {
      throw new Error(
        `Routine "${routine.name}" requires at least ${required} argument${required > 1 ? "s" : ""} (${routine.identity_arguments}) but ${count} were provided.`
      );
    }
    if (count > total) {
      throw new Error(
        `Routine "${routine.name}" accepts at most ${total} argument${total > 1 ? "s" : ""} (${routine.identity_arguments}) but ${count} were provided.`
      );
    }
    return resolveTemplateValue(parsed, context);
  }

  if (parsed && typeof parsed === "object") {
    if (required === 0 && total === 0) {
      throw new Error(`Routine "${routine.name}" takes no arguments.`);
    }
    return resolveTemplateValue(parsed, context);
  }

  throw new Error("Arguments JSON must be an array or object.");
}

async function routineOptions() {
  const routines = await listRoutines();
  return routines
    .filter((routine) => ["function", "procedure"].includes(routine.kind))
    .map((routine) => ({
      value: String(routine.oid),
      label: `${routine.kind}: ${routine.name}(${routine.identity_arguments || ""})`
    }));
}

const DB_Routine = {
  namespace: "Database",
  description: "Call a PostgreSQL function or stored procedure from the current tenant schema",
  configFields: async () => [
    {
      name: "routine_oid",
      label: "DB routine",
      type: "String",
      input_type: "select",
      required: true,
      options: await routineOptions(),
      sublabel: "Select a function or stored procedure from the current tenant schema."
    },
    {
      name: "arguments_json",
      label: "Arguments JSON",
      input_type: "code",
      type: "String",
      required: false,
      attributes: { mode: "application/json", nojoins: true },
      sublabel: "JSON array (positional) or JSON object (named). Supports templates like {{row.id}}, {{user.email}}, {{configuration.some_value}}. Leave blank only for zero-argument routines.",
      validator(s) {
        if (!s || !String(s).trim()) return true;
        try {
          const parsed = JSON.parse(s);
          if (!Array.isArray(parsed) && (parsed === null || typeof parsed !== "object")) {
            return "Arguments must be a JSON array or object.";
          }
          return true;
        } catch (e) {
          return `Invalid JSON: ${e.message}`;
        }
      }
    }
  ],
  configuration_summary: (cfg = {}) => `Call DB routine OID ${cfg.routine_oid || "not selected"}`,
  run: async ({ row, user, configuration }) => {
    try {
      if (!configuration?.routine_oid) {
        return {
          error: "DB_Routine is not configured: no routine selected. Open the trigger/action configuration and select a DB routine."
        };
      }
      return await callRoutine({
        routineOid: configuration.routine_oid,
        argumentsJson: configuration.arguments_json,
        row,
        user,
        configuration
      });
    } catch (error) {
      return { error: error.message || "DB_Routine execution failed." };
    }
  }
};

module.exports = { DB_Routine, callRoutine };
