const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ALLOWED_LANGUAGES = new Set(["sql", "plpgsql"]);
const ALLOWED_VOLATILITY = new Set(["VOLATILE", "STABLE", "IMMUTABLE"]);
const ALLOWED_SECURITY = new Set(["INVOKER", "DEFINER"]);

function assertIdentifier(name, label = "identifier") {
  if (!IDENTIFIER_RE.test(String(name || ""))) throw new Error(`Invalid ${label}. Use letters, numbers, and underscores; do not start with a number.`);
  return name;
}

function assertAllowed(value, allowed, label) {
  if (!allowed.has(String(value))) throw new Error(`Invalid ${label}: ${value}`);
  return value;
}

module.exports = { IDENTIFIER_RE, ALLOWED_LANGUAGES, ALLOWED_VOLATILITY, ALLOWED_SECURITY, assertIdentifier, assertAllowed };
