const db = require("@saltcorn/data/db");

const ROUTINE_SELECT = `
SELECT
  p.oid,
  n.nspname AS schema,
  p.proname AS name,
  p.prokind,
  CASE p.prokind
    WHEN 'f' THEN 'function'
    WHEN 'p' THEN 'procedure'
    WHEN 'a' THEN 'aggregate'
    WHEN 'w' THEN 'window'
  END AS kind,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS result_type,
  pg_get_functiondef(p.oid) AS definition,
  l.lanname AS language,
  p.provolatile,
  p.pronargs,
  p.pronargdefaults,
  COALESCE(argmeta.input_args, '[]'::json) AS input_args,
  CASE p.provolatile
    WHEN 'i' THEN 'IMMUTABLE'
    WHEN 's' THEN 'STABLE'
    WHEN 'v' THEN 'VOLATILE'
  END AS volatility,
  p.prosecdef,
  obj_description(p.oid, 'pg_proc') AS description
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
LEFT JOIN LATERAL (
  SELECT json_agg(
    json_build_object(
      'position', u.ord,
      'name', CASE
        WHEN p.proargnames IS NOT NULL AND array_length(p.proargnames, 1) >= u.ord THEN p.proargnames[u.ord]
        ELSE NULL
      END,
      'type', format_type(u.type_oid, NULL)
    )
    ORDER BY u.ord
  ) AS input_args
  FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY AS u(type_oid, ord)
) argmeta ON true
WHERE p.prokind IN ('f', 'p')
  AND NOT EXISTS (
    SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
  )
  AND /*SCHEMA_FILTER*/
`;

function ensurePostgres() {
  if (db.isSQLite) {
    throw new Error("DB Code only supports PostgreSQL. SQLite does not support persistent stored routines.");
  }
}

function currentTenantSchema() {
  if (typeof db.getTenantSchema !== "function") throw new Error("Cannot resolve the current Saltcorn tenant schema.");
  return db.getTenantSchema();
}

async function listRoutines() {
  ensurePostgres();
  const schema = currentTenantSchema();
  const { rows } = await db.query(
    ROUTINE_SELECT.replace("/*SCHEMA_FILTER*/", "n.nspname = $1") +
      "\nORDER BY p.proname, identity_arguments",
    [schema]
  );
  return rows;
}

async function getRoutineByOid(oid) {
  ensurePostgres();
  const schema = currentTenantSchema();
  const parsedOid = Number.parseInt(oid, 10);
  if (!Number.isInteger(parsedOid) || parsedOid <= 0) throw new Error("Invalid routine OID.");
  const { rows } = await db.query(
    ROUTINE_SELECT.replace("/*SCHEMA_FILTER*/", "n.nspname = $1 AND p.oid = $2") +
      "\nLIMIT 1",
    [schema, parsedOid]
  );
  return rows[0] || null;
}

module.exports = { ensurePostgres, currentTenantSchema, listRoutines, getRoutineByOid };
