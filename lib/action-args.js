function getPath(source, path) {
  if (!path) return undefined;
  return String(path).split(".").reduce((acc, part) => (acc == null ? undefined : acc[part]), source);
}

function resolveTemplateValue(value, context) {
  if (Array.isArray(value)) return value.map((item) => resolveTemplateValue(item, context));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, resolveTemplateValue(val, context)]));
  }
  if (typeof value !== "string") return value;
  const exact = value.match(/^\s*\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}\s*$/);
  if (exact) {
    const key = exact[1];
    if (key.startsWith("row.")) return getPath(context.row, key.slice(4));
    if (key.startsWith("user.")) return getPath(context.user, key.slice(5));
    if (key.startsWith("configuration.")) return getPath(context.configuration, key.slice(14));
    return getPath(context.row, key) ?? getPath(context.configuration, key) ?? getPath(context.user, key);
  }
  return value.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/g, (_, key) => {
    const resolved = key.startsWith("row.")
      ? getPath(context.row, key.slice(4))
      : key.startsWith("user.")
        ? getPath(context.user, key.slice(5))
        : key.startsWith("configuration.")
          ? getPath(context.configuration, key.slice(14))
          : getPath(context.row, key) ?? getPath(context.configuration, key) ?? getPath(context.user, key);
    return resolved == null ? "" : String(resolved);
  });
}

function parseArgumentsJson(argumentsJson, context, opts = {}) {
  const text = String(argumentsJson || "").trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed) && !(opts.allowObject && parsed && typeof parsed === "object")) {
    throw new Error("DB_Routine arguments JSON must be an array.");
  }
  return resolveTemplateValue(parsed, context);
}

module.exports = { getPath, resolveTemplateValue, parseArgumentsJson };
