const db = require("@saltcorn/data/db");
const { listRoutines, getRoutineByOid } = require("./introspection");
const { quoteIdent } = require("./sql-builders");
const { parseArgumentsJson } = require("./action-args");

function placeholders(count) {
  return Array.from({ length: count }, (_, index) => `$${index + 1}`).join(", ");
}

async function callRoutine({ routineOid, argumentsJson, row, user, configuration }) {
  const routine = await getRoutineByOid(routineOid);
  if (!routine) throw new Error("Configured DB routine was not found in the current tenant schema.");
  if (!["function", "procedure"].includes(routine.kind)) throw new Error("DB_Routine only supports functions and procedures.");

  const values = parseArgumentsJson(argumentsJson, { row, user, configuration });
  const routineRef = `${quoteIdent(routine.schema)}.${quoteIdent(routine.name)}`;
  if (routine.kind === "procedure") {
    const result = await db.query(`CALL ${routineRef}(${placeholders(values.length)})`, values);
    return { success: true, kind: routine.kind, routine: routine.name, rowCount: result.rowCount || 0 };
  }

  const result = await db.query(`SELECT * FROM ${routineRef}(${placeholders(values.length)})`, values);
  return { success: true, kind: routine.kind, routine: routine.name, rows: result.rows || [], rowCount: result.rowCount || 0 };
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
      label: "Arguments JSON array",
      input_type: "code",
      type: "String",
      required: false,
      attributes: { mode: "application/json", nojoins: true },
      sublabel: "JSON array of positional arguments. Supports templates like {{row.id}}, {{user.email}}, or {{configuration.some_value}}. Leave blank for no arguments."
    }
  ],
  configuration_summary: (cfg = {}) => `Call DB routine OID ${cfg.routine_oid || "not selected"}`,
  run: async ({ row, user, configuration }) => {
    return callRoutine({
      routineOid: configuration?.routine_oid,
      argumentsJson: configuration?.arguments_json,
      row,
      user,
      configuration
    });
  }
};

module.exports = { DB_Routine, callRoutine };
