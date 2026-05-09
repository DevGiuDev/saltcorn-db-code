const { parseArgumentsJson } = require("./action-args");

function routineArity(routine) {
  const total = Number.isInteger(routine?.pronargs) ? routine.pronargs : Number(routine?.pronargs || 0);
  const defaults = Number.isInteger(routine?.pronargdefaults)
    ? routine.pronargdefaults
    : Number(routine?.pronargdefaults || 0);
  const required = Math.max(0, total - defaults);
  return { required, total };
}

function coerceRoutineInputArgs(routine) {
  if (Array.isArray(routine?.input_args)) return routine.input_args;
  if (typeof routine?.input_args === "string") {
    try {
      const parsed = JSON.parse(routine.input_args);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function resolveRoutineArguments(routine, argumentsJson, context) {
  const parsed = parseArgumentsJson(argumentsJson, context, { allowObject: true });
  const argMeta = coerceRoutineInputArgs(routine);
  const { required, total } = routineArity(routine);

  if (Array.isArray(parsed)) {
    if (parsed.length < required || parsed.length > total) {
      throw new Error(`DB_Routine expected ${required}-${total} positional arguments, got ${parsed.length}.`);
    }
    return parsed;
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("DB_Routine arguments must be a JSON array or object.");
  }

  const unnamedRequired = argMeta.slice(0, required).filter((arg) => !arg.name).length;
  if (unnamedRequired > 0) {
    throw new Error("This routine has unnamed required parameters. Use positional JSON array arguments.");
  }

  const values = [];
  for (let i = 0; i < total; i += 1) {
    const name = argMeta[i]?.name;
    const hasValue = name && Object.prototype.hasOwnProperty.call(parsed, name);
    if (hasValue) {
      values.push(parsed[name]);
      continue;
    }
    if (i < required) throw new Error(`Missing required argument: ${name || `#${i + 1}`}.`);
    break;
  }
  return values;
}

function encodeTemplateValue(str) {
  return Buffer.from(String(str || ""), "utf8").toString("base64");
}

function decodeTemplateValue(str) {
  if (!str) return "";
  return Buffer.from(String(str), "base64").toString("utf8");
}

function buildArgumentTemplates(routine) {
  const args = coerceRoutineInputArgs(routine);
  const { required, total } = routineArity(routine);
  const reqArgs = args.slice(0, required);
  const allArgs = args.slice(0, total);

  const positionalRequired = JSON.stringify(
    reqArgs.map((arg, i) => `{{row.${arg?.name || `arg${i + 1}`}}}`),
    null,
    2
  );
  const positionalAll = JSON.stringify(
    allArgs.map((arg, i) => `{{row.${arg?.name || `arg${i + 1}`}}}`),
    null,
    2
  );

  const namedRequiredObj = {};
  reqArgs.forEach((arg, i) => {
    if (arg?.name) namedRequiredObj[arg.name] = `{{row.${arg.name}}}`;
    else namedRequiredObj[`arg${i + 1}`] = `{{row.arg${i + 1}}}`;
  });
  const namedRequired = JSON.stringify(namedRequiredObj, null, 2);

  return {
    positionalRequired,
    positionalAll,
    namedRequired,
    encoded: {
      positionalRequired: encodeTemplateValue(positionalRequired),
      positionalAll: encodeTemplateValue(positionalAll),
      namedRequired: encodeTemplateValue(namedRequired),
    },
    required,
    total,
  };
}

module.exports = {
  routineArity,
  resolveRoutineArguments,
  coerceRoutineInputArgs,
  buildArgumentTemplates,
  encodeTemplateValue,
  decodeTemplateValue,
};
