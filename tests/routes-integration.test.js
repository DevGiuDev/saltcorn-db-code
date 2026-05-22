/**
 * Route integration tests for saltcorn-db-code.
 *
 * Tests the route handlers (list, show, create, edit, delete) and the
 * DBCodeConsole viewtemplate by mocking the Saltcorn data layer and
 * verifying HTML output and error handling.
 */

const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setup, teardown, getMocks } = require("./__mocks__/mock-saltcorn");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function mockRes({ sendWrap } = {}) {
  const chunks = { html: null, statusCode: null, redirectUrl: null, json: null };
  return {
    statusCode: 200,
    _chunks: chunks,
    status(code) { chunks.statusCode = code; return this; },
    send(html) { chunks.html = html; return this; },
    sendWrap(title, html) { chunks.html = html; if (sendWrap) sendWrap(title, html); return this; },
    redirect(url) { chunks.redirectUrl = url; return this; },
    json(data) { chunks.json = data; return this; },
    setHeader() { return this; },
    flash() {},
  };
}

function mockReq(overrides = {}) {
  return {
    params: {},
    query: {},
    body: {},
    originalUrl: "/db-code",
    url: "/db-code",
    user: { role_id: 1, id: 1, email: "admin@test.com" },
    csrfToken: () => "test-csrf-token",
    flash: () => {},
    ...overrides,
  };
}

const SAMPLE_ROUTINES = [
  {
    oid: 12345,
    schema: "public",
    name: "hello",
    prokind: "f",
    kind: "function",
    identity_arguments: "",
    arguments: "",
    result_type: "text",
    definition: "CREATE OR REPLACE FUNCTION public.hello() RETURNS text LANGUAGE sql AS $$SELECT 'hello'$$;",
    language: "sql",
    provolatile: "i",
    volatility: "IMMUTABLE",
    pronargs: 0,
    pronargdefaults: 0,
    input_args: [],
    prosecdef: false,
    description: null,
  },
  {
    oid: 12346,
    schema: "public",
    name: "add_nums",
    prokind: "f",
    kind: "function",
    identity_arguments: "a integer, b integer",
    arguments: "a integer, b integer",
    result_type: "integer",
    definition: "CREATE OR REPLACE FUNCTION public.add_nums(a integer, b integer) RETURNS integer LANGUAGE plpgsql AS $$BEGIN RETURN a + b; END;$$;",
    language: "plpgsql",
    provolatile: "v",
    volatility: "VOLATILE",
    pronargs: 2,
    pronargdefaults: 0,
    input_args: [
      { position: 1, name: "a", type: "integer" },
      { position: 2, name: "b", type: "integer" },
    ],
    prosecdef: false,
    description: "Adds two numbers",
  },
  {
    oid: 12347,
    schema: "public",
    name: "do_thing",
    prokind: "p",
    kind: "procedure",
    identity_arguments: "",
    arguments: "",
    result_type: null,
    definition: "CREATE OR REPLACE PROCEDURE public.do_thing() LANGUAGE plpgsql AS $$BEGIN RAISE NOTICE 'done'; END;$$;",
    language: "plpgsql",
    provolatile: "v",
    volatility: "VOLATILE",
    pronargs: 0,
    pronargdefaults: 0,
    input_args: [],
    prosecdef: false,
    description: null,
  },
];

/* ------------------------------------------------------------------ */
/*  Test lifecycle                                                     */
/* ------------------------------------------------------------------ */

beforeEach(() => setup());
afterEach(() => teardown());

/* ------------------------------------------------------------------ */
/*  Auth tests                                                         */
/* ------------------------------------------------------------------ */

test("list route rejects non-admin (role_id !== 1)", async () => {
  const listRoute = require("../routes/list");
  const req = mockReq({ user: { role_id: 2, id: 2 } });
  const res = mockRes();
  await listRoute(req, res);
  assert.equal(res._chunks.statusCode, 403);
  assert.ok(res._chunks.html.includes("Forbidden") || res._chunks.html.includes("administrators"), "Should contain access denied message");
});

test("list route rejects unauthenticated user — redirect", async () => {
  const listRoute = require("../routes/list");
  const req = mockReq({ user: undefined });
  const res = mockRes();
  await listRoute(req, res);
  assert.ok(res._chunks.redirectUrl, "Unauthenticated user should be redirected");
  assert.match(res._chunks.redirectUrl, /login/);
});

test("show route rejects non-admin", async () => {
  const showRoute = require("../routes/show");
  const req = mockReq({ user: { role_id: 2 }, params: { oid: "12345" } });
  const res = mockRes();
  await showRoute(req, res);
  assert.equal(res._chunks.statusCode, 403);
});


test("create form rejects non-admin", async () => {
  const { createFormRoute } = require("../routes/create");
  const req = mockReq({ user: { role_id: 2 } });
  const res = mockRes();
  await createFormRoute(req, res);
  assert.equal(res._chunks.statusCode, 403);
});

test("create POST rejects non-admin", async () => {
  const { createPostRoute } = require("../routes/create");
  const req = mockReq({ user: { role_id: 2 }, body: {} });
  const res = mockRes();
  await createPostRoute(req, res);
  assert.equal(res._chunks.statusCode, 403);
});

test("edit form rejects non-admin", async () => {
  const { editFormRoute } = require("../routes/edit");
  const req = mockReq({ user: { role_id: 2 }, params: { oid: "12345" } });
  const res = mockRes();
  await editFormRoute(req, res);
  assert.equal(res._chunks.statusCode, 403);
});

test("delete form rejects non-admin", async () => {
  const { deleteFormRoute } = require("../routes/delete");
  const req = mockReq({ user: { role_id: 2 }, params: { oid: "12345" } });
  const res = mockRes();
  await deleteFormRoute(req, res);
  assert.equal(res._chunks.statusCode, 403);
});

test("auth helper — isAdmin returns false for non-admin", () => {
  const { isAdmin } = require("../lib/auth");
  assert.equal(isAdmin({ user: { role_id: 2 } }), false);
  assert.equal(isAdmin({ user: undefined }), false);
  assert.equal(isAdmin({}), false);
  assert.equal(isAdmin(null), false);
});

test("auth helper — isAdmin returns true for admin", () => {
  const { isAdmin } = require("../lib/auth");
  assert.equal(isAdmin({ user: { role_id: 1 } }), true);
});

/* ------------------------------------------------------------------ */
/*  SQLite block tests                                                 */
/* ------------------------------------------------------------------ */

test("introspection throws on SQLite", () => {
  const mocks = getMocks();
  mocks.db.isSQLite = true;
  // Need to re-require since the module was loaded in beforeEach with mocks already set up
  delete require.cache[require.resolve("../lib/introspection")];
  const { ensurePostgres } = require("../lib/introspection");
  assert.throws(() => ensurePostgres(), /PostgreSQL/);
});

test("introspection — currentTenantSchema throws if getTenantSchema missing", () => {
  const mocks = getMocks();
  mocks.db.getTenantSchema = undefined;
  delete require.cache[require.resolve("../lib/introspection")];
  const { currentTenantSchema } = require("../lib/introspection");
  assert.throws(() => currentTenantSchema(), /tenant schema/);
});

test("introspection — getRoutineByOid rejects invalid OID", async () => {
  const mocks = getMocks();
  mocks.db.query = async () => ({ rows: [], rowCount: 0 });
  delete require.cache[require.resolve("../lib/introspection")];
  const { getRoutineByOid } = require("../lib/introspection");
  await assert.rejects(() => getRoutineByOid("abc"), /Invalid.*OID/);
  await assert.rejects(() => getRoutineByOid("-1"), /Invalid.*OID/);
  await assert.rejects(() => getRoutineByOid("0"), /Invalid.*OID/);
});

/* ------------------------------------------------------------------ */
/*  List route                                                         */
/* ------------------------------------------------------------------ */

test("list route renders routine table", async () => {
  const mocks = getMocks();
  mocks.db.query = async () => ({ rows: SAMPLE_ROUTINES, rowCount: 3 });
  const listRoute = require("../routes/list");
  const req = mockReq();
  const res = mockRes();
  await listRoute(req, res);
  const html = res._chunks.html;
  assert.ok(html, "Should produce HTML");
  assert.match(html, /hello/, "Should contain function name");
  assert.match(html, /add_nums/, "Should contain second function name");
  assert.match(html, /do_thing/, "Should contain procedure name");
  assert.match(html, /DB Code Console/i, "Should have console heading");
});

test("list route filters by kind", async () => {
  const mocks = getMocks();
  mocks.db.query = async () => ({ rows: SAMPLE_ROUTINES, rowCount: 3 });
  const listRoute = require("../routes/list");
  const req = mockReq({ query: { kind: "procedure" } });
  const res = mockRes();
  await listRoute(req, res);
  const html = res._chunks.html;
  assert.ok(html.includes("do_thing"), "Should show procedure");
  // Functions are still in the HTML because filtering is done client-side in JS
});

test("list route shows unsupported message on SQLite", async () => {
  const mocks = getMocks();
  mocks.db.isSQLite = true;
  delete require.cache[require.resolve("../lib/introspection")];
  delete require.cache[require.resolve("../lib/render-routines")];
  delete require.cache[require.resolve("../routes/list")];
  const listRoute = require("../routes/list");
  const req = mockReq();
  const res = mockRes();
  await listRoute(req, res);
  const html = res._chunks.html;
  assert.match(html, /PostgreSQL/i, "Should mention PostgreSQL");
});

/* ------------------------------------------------------------------ */
/*  Show route                                                         */
/* ------------------------------------------------------------------ */

test("show route renders routine detail", async () => {
  const mocks = getMocks();
  mocks.db.query = async (sql, params) => {
    if (sql.includes("p.oid")) return { rows: [SAMPLE_ROUTINES[1]], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const showRoute = require("../routes/show");
  const req = mockReq({ params: { oid: "12346" } });
  const res = mockRes();
  await showRoute(req, res);
  const html = res._chunks.html;
  assert.ok(html, "Should produce HTML");
  assert.match(html, /add_nums/, "Should contain function name");
  assert.match(html, /CREATE OR REPLACE FUNCTION/, "Should show SQL definition");
  assert.match(html, /Definition/i, "Should have definition section");
  assert.match(html, /Metadata/i, "Should have metadata section");
});

test("show route shows not-found message for missing OID", async () => {
  const mocks = getMocks();
  mocks.db.query = async () => ({ rows: [], rowCount: 0 });
  const showRoute = require("../routes/show");
  const req = mockReq({ params: { oid: "99999" } });
  const res = mockRes();
  await showRoute(req, res);
  // The route delegates to renderRoutineDetail which returns "not found" HTML
  assert.match(res._chunks.html, /not found/i);
});

/* ------------------------------------------------------------------ */
/*  Create routes                                                      */
/* ------------------------------------------------------------------ */

test("create form route renders structured form", async () => {
  const { createFormRoute } = require("../routes/create");
  const req = mockReq();
  const res = mockRes();
  await createFormRoute(req, res);
  const html = res._chunks.html;
  assert.ok(html, "Should produce HTML");
  assert.match(html, /New function/i, "Should have create title");
  assert.match(html, /name="name"/, "Should have name field");
  assert.match(html, /name="body"/, "Should have body field");
  assert.match(html, /name="returnType"/, "Should have return type field");
  assert.match(html, /name="language"/, "Should have language selector");
});

test("create procedure form route renders", async () => {
  const { createProcedureFormRoute } = require("../routes/create");
  const req = mockReq();
  const res = mockRes();
  await createProcedureFormRoute(req, res);
  const html = res._chunks.html;
  assert.match(html, /New stored procedure/i);
  assert.match(html, /name="name"/);
  // Procedures should NOT have return type
  assert.ok(!html.includes('name="returnType"'), "Procedure form should not have return type");
});

test("create DDL form route renders", async () => {
  const { createDdlFormRoute } = require("../routes/create");
  const req = mockReq();
  const res = mockRes();
  await createDdlFormRoute(req, res);
  const html = res._chunks.html;
  assert.match(html, /New from DDL/i);
  assert.match(html, /name="ddl"/);
});

test("create POST route — function created successfully", async () => {
  const mocks = getMocks();
  const queries = [];
  mocks.db.query = async (sql) => { queries.push(sql); return { rows: [], rowCount: 0 }; };
  const { createPostRoute } = require("../routes/create");
  const req = mockReq({
    body: {
      name: "double_value",
      argumentsSql: "val integer",
      returnType: "integer",
      language: "plpgsql",
      volatility: "IMMUTABLE",
      security: "INVOKER",
      body: "RETURN val * 2",
      description: "Doubles a value",
    },
  });
  const res = mockRes();
  await createPostRoute(req, res);
  assert.ok(res._chunks.redirectUrl, "Should redirect after success");
  assert.match(res._chunks.redirectUrl, /db-code/);
  assert.ok(queries.length >= 1, "Should execute at least one query");
  assert.match(queries[0], /CREATE OR REPLACE FUNCTION "public"\."double_value"/);
});

test("create POST route — validation error shown inline", async () => {
  const { createPostRoute } = require("../routes/create");
  const req = mockReq({
    body: {
      name: "bad;name",
      argumentsSql: "",
      returnType: "integer",
      language: "plpgsql",
      volatility: "VOLATILE",
      security: "INVOKER",
      body: "SELECT 1",
    },
  });
  const res = mockRes();
  await createPostRoute(req, res);
  const html = res._chunks.html;
  assert.ok(html, "Should render form again with error");
  assert.match(html, /Invalid/i, "Should show validation error");
});

test("create POST route — procedure created successfully", async () => {
  const mocks = getMocks();
  const queries = [];
  mocks.db.query = async (sql) => { queries.push(sql); return { rows: [], rowCount: 0 }; };
  const { createProcedurePostRoute } = require("../routes/create");
  const req = mockReq({
    body: {
      name: "log_action",
      argumentsSql: "msg text",
      language: "plpgsql",
      security: "INVOKER",
      body: "RAISE NOTICE '%', msg",
    },
  });
  const res = mockRes();
  await createProcedurePostRoute(req, res);
  assert.ok(res._chunks.redirectUrl, "Should redirect after success");
  assert.match(queries[0], /CREATE OR REPLACE PROCEDURE "public"\."log_action"/);
});

test("create POST DDL — success", async () => {
  const mocks = getMocks();
  const queries = [];
  mocks.db.query = async (sql) => { queries.push(sql); return { rows: [], rowCount: 0 }; };
  const { createDdlPostRoute } = require("../routes/create");
  const ddl = 'CREATE OR REPLACE FUNCTION "public".calc(x integer) RETURNS integer LANGUAGE sql AS $$SELECT x + 1$$;';
  const req = mockReq({ body: { ddl } });
  const res = mockRes();
  await createDdlPostRoute(req, res);
  assert.ok(res._chunks.redirectUrl, "Should redirect after success");
  assert.equal(queries[0], ddl, "Should execute exact DDL");
});

test("create POST DDL — wrong schema rejected", async () => {
  const { createDdlPostRoute } = require("../routes/create");
  const ddl = "CREATE OR REPLACE FUNCTION other_schema.calc() RETURNS integer LANGUAGE sql AS $$SELECT 1$$;";
  const req = mockReq({ body: { ddl } });
  const res = mockRes();
  await createDdlPostRoute(req, res);
  const html = res._chunks.html;
  assert.ok(html, "Should render form with error");
  assert.match(html, /tenant schema/i);
});

/* ------------------------------------------------------------------ */
/*  Edit routes                                                        */
/* ------------------------------------------------------------------ */

test("edit form route renders with current DDL", async () => {
  const mocks = getMocks();
  mocks.db.query = async (sql, params) => {
    if (sql.includes("p.oid")) return { rows: [SAMPLE_ROUTINES[0]], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const { editFormRoute } = require("../routes/edit");
  const req = mockReq({ params: { oid: "12345" } });
  const res = mockRes();
  await editFormRoute(req, res);
  const html = res._chunks.html;
  assert.ok(html, "Should produce HTML");
  assert.match(html, /Edit function: hello/i);
  assert.match(html, /name="ddl"/);
  assert.match(html, /CREATE OR REPLACE FUNCTION/);
});

test("edit form route — 404 for missing OID", async () => {
  const mocks = getMocks();
  mocks.db.query = async () => ({ rows: [], rowCount: 0 });
  const { editFormRoute } = require("../routes/edit");
  const req = mockReq({ params: { oid: "99999" } });
  const res = mockRes();
  await editFormRoute(req, res);
  assert.equal(res._chunks.statusCode, 404);
});

test("edit POST route — success", async () => {
  const mocks = getMocks();
  const queries = [];
  mocks.db.query = async (sql, params) => {
    if (sql.includes("p.oid")) return { rows: [SAMPLE_ROUTINES[0]], rowCount: 1 };
    queries.push(sql);
    return { rows: [], rowCount: 0 };
  };
  const { editPostRoute } = require("../routes/edit");
  const ddl = 'CREATE OR REPLACE FUNCTION "public".hello() RETURNS text LANGUAGE sql AS $$SELECT \'world\'$$;';
  const req = mockReq({ params: { oid: "12345" }, body: { ddl } });
  const res = mockRes();
  await editPostRoute(req, res);
  assert.ok(res._chunks.redirectUrl, "Should redirect after success");
  assert.match(res._chunks.redirectUrl, /routine\/12345/);
  assert.equal(queries[0], ddl, "Should execute the edited DDL");
});

test("edit POST route — wrong schema rejected", async () => {
  const mocks = getMocks();
  mocks.db.query = async (sql, params) => {
    if (sql.includes("p.oid")) return { rows: [SAMPLE_ROUTINES[0]], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const { editPostRoute } = require("../routes/edit");
  const ddl = "CREATE OR REPLACE FUNCTION evil.hello() RETURNS text LANGUAGE sql AS $$SELECT 'pwned'$$;";
  const req = mockReq({ params: { oid: "12345" }, body: { ddl } });
  const res = mockRes();
  await editPostRoute(req, res);
  const html = res._chunks.html;
  assert.match(html, /tenant schema/i);
});

/* ------------------------------------------------------------------ */
/*  Delete routes                                                      */
/* ------------------------------------------------------------------ */

test("delete form route renders confirmation", async () => {
  const mocks = getMocks();
  mocks.db.query = async (sql, params) => {
    if (sql.includes("pg_describe_object")) return { rows: [], rowCount: 0 };
    if (sql.includes("p.oid")) return { rows: [SAMPLE_ROUTINES[0]], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const { deleteFormRoute } = require("../routes/delete");
  const req = mockReq({ params: { oid: "12345" } });
  const res = mockRes();
  await deleteFormRoute(req, res);
  const html = res._chunks.html;
  assert.ok(html, "Should produce HTML");
  assert.match(html, /Delete function: hello/i);
  assert.match(html, /cannot be undone/i);
  assert.match(html, /DROP FUNCTION/);
  assert.match(html, /name="confirmName"/);
});

test("delete form route shows dependencies", async () => {
  const mocks = getMocks();
  mocks.db.query = async (sql, params) => {
    if (sql.includes("pg_describe_object")) {
      return { rows: [{ deptype: "n", dependent_object: "trigger my_trigger on public.users" }], rowCount: 1 };
    }
    if (sql.includes("p.oid")) return { rows: [SAMPLE_ROUTINES[0]], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const { deleteFormRoute } = require("../routes/delete");
  const req = mockReq({ params: { oid: "12345" } });
  const res = mockRes();
  await deleteFormRoute(req, res);
  const html = res._chunks.html;
  assert.match(html, /my_trigger/, "Should show dependent object");
});

test("delete form route — 404 for missing OID", async () => {
  const mocks = getMocks();
  mocks.db.query = async () => ({ rows: [], rowCount: 0 });
  const { deleteFormRoute } = require("../routes/delete");
  const req = mockReq({ params: { oid: "99999" } });
  const res = mockRes();
  await deleteFormRoute(req, res);
  assert.equal(res._chunks.statusCode, 404);
});

test("delete POST route — success with correct name", async () => {
  const mocks = getMocks();
  const queries = [];
  mocks.db.query = async (sql, params) => {
    if (sql.includes("pg_describe_object")) return { rows: [], rowCount: 0 };
    if (sql.includes("p.oid")) return { rows: [SAMPLE_ROUTINES[0]], rowCount: 1 };
    queries.push(sql);
    return { rows: [], rowCount: 0 };
  };
  const { deletePostRoute } = require("../routes/delete");
  const req = mockReq({ params: { oid: "12345" }, body: { confirmName: "hello" } });
  const res = mockRes();
  await deletePostRoute(req, res);
  assert.ok(res._chunks.redirectUrl, "Should redirect after success");
  assert.match(res._chunks.redirectUrl, /db-code/);
  assert.ok(queries.some(q => q.includes("DROP FUNCTION")), "Should execute DROP FUNCTION");
});

test("delete POST route — wrong confirmation name rejected", async () => {
  const mocks = getMocks();
  mocks.db.query = async (sql, params) => {
    if (sql.includes("pg_describe_object")) return { rows: [], rowCount: 0 };
    if (sql.includes("p.oid")) return { rows: [SAMPLE_ROUTINES[0]], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const { deletePostRoute } = require("../routes/delete");
  const req = mockReq({ params: { oid: "12345" }, body: { confirmName: "wrong_name" } });
  const res = mockRes();
  await deletePostRoute(req, res);
  const html = res._chunks.html;
  assert.ok(html, "Should render form again with error");
  assert.match(html, /does not match/i);
});

/* ------------------------------------------------------------------ */
/*  Execute routes                                                     */
/* ------------------------------------------------------------------ */

test("execute form rejects non-admin", async () => {
  const { executeFormRoute } = require("../routes/execute");
  const req = mockReq({ user: { role_id: 2 }, params: { oid: "12345" } });
  const res = mockRes();
  await executeFormRoute(req, res);
  assert.equal(res._chunks.statusCode, 403);
});

test("execute POST rejects non-admin", async () => {
  const { executePostRoute } = require("../routes/execute");
  const req = mockReq({ user: { role_id: 2 }, params: { oid: "12345" }, body: {} });
  const res = mockRes();
  await executePostRoute(req, res);
  assert.equal(res._chunks.statusCode, 403);
});

test("execute form — zero-arg function renders direct execute button", async () => {
  const mocks = getMocks();
  mocks.db.query = async (sql, params) => {
    if (sql.includes("p.oid")) return { rows: [SAMPLE_ROUTINES[0]], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const { executeFormRoute } = require("../routes/execute");
  const req = mockReq({ params: { oid: "12345" } });
  const res = mockRes();
  await executeFormRoute(req, res);
  const html = res._chunks.html;
  assert.match(html, /Execute function: hello/i);
  assert.match(html, /takes no arguments/i);
  assert.match(html, /type="submit"/);
});

test("execute form — function with arguments renders input fields", async () => {
  const mocks = getMocks();
  mocks.db.query = async (sql, params) => {
    if (sql.includes("p.oid")) return { rows: [SAMPLE_ROUTINES[1]], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const { executeFormRoute } = require("../routes/execute");
  const req = mockReq({ params: { oid: "12346" } });
  const res = mockRes();
  await executeFormRoute(req, res);
  const html = res._chunks.html;
  assert.match(html, /Execute function: add_nums/i);
  assert.match(html, /name="arg_0"/);
  assert.match(html, /name="arg_1"/);
});

test("execute form — 404 for missing OID", async () => {
  const mocks = getMocks();
  mocks.db.query = async () => ({ rows: [], rowCount: 0 });
  const { executeFormRoute } = require("../routes/execute");
  const req = mockReq({ params: { oid: "99999" } });
  const res = mockRes();
  await executeFormRoute(req, res);
  assert.match(res._chunks.html, /not found/i);
});

test("execute POST — zero-arg function returns result table", async () => {
  const mocks = getMocks();
  const queries = [];
  mocks.db.query = async (sql, params) => {
    if (sql.includes("p.oid")) return { rows: [SAMPLE_ROUTINES[0]], rowCount: 1 };
    queries.push({ sql, params });
    return { rows: [{ hello: "hello" }], rowCount: 1 };
  };
  const { executePostRoute } = require("../routes/execute");
  const req = mockReq({ params: { oid: "12345" }, body: {} });
  const res = mockRes();
  await executePostRoute(req, res);
  const html = res._chunks.html;
  assert.match(html, /hello/);
  assert.match(html, /Result/);
  assert.ok(queries.some(q => q.sql.includes("SELECT * FROM")), "Should use SELECT for functions");
});

test("execute POST — function with arguments passes params", async () => {
  const mocks = getMocks();
  const queries = [];
  mocks.db.query = async (sql, params) => {
    if (sql.includes("p.oid")) return { rows: [SAMPLE_ROUTINES[1]], rowCount: 1 };
    queries.push({ sql, params });
    return { rows: [{ add_nums: 7 }], rowCount: 1 };
  };
  const { executePostRoute } = require("../routes/execute");
  const req = mockReq({ params: { oid: "12346" }, body: { arg_0: "3", arg_1: "4" } });
  const res = mockRes();
  await executePostRoute(req, res);
  const html = res._chunks.html;
  assert.match(html, /7/);
  const execQuery = queries.find(q => q.sql.includes("SELECT * FROM"));
  assert.ok(execQuery, "Should execute SELECT");
  assert.deepEqual(execQuery.params, [3, 4], "Should pass parsed integers");
});

test("execute POST — procedure uses CALL", async () => {
  const mocks = getMocks();
  const queries = [];
  mocks.db.query = async (sql, params) => {
    if (sql.includes("p.oid")) return { rows: [SAMPLE_ROUTINES[2]], rowCount: 1 };
    queries.push({ sql, params });
    return { rows: [], rowCount: 0 };
  };
  const { executePostRoute } = require("../routes/execute");
  const req = mockReq({ params: { oid: "12347" }, body: {} });
  const res = mockRes();
  await executePostRoute(req, res);
  const html = res._chunks.html;
  assert.match(html, /success/i);
  const execQuery = queries.find(q => q.sql.includes("CALL"));
  assert.ok(execQuery, "Should use CALL for procedures");
});

test("execute POST — SQL error shown inline", async () => {
  const mocks = getMocks();
  mocks.db.query = async (sql, params) => {
    if (sql.includes("p.oid")) return { rows: [SAMPLE_ROUTINES[0]], rowCount: 1 };
    throw new Error('relation "nonexistent" does not exist');
  };
  const { executePostRoute } = require("../routes/execute");
  const req = mockReq({ params: { oid: "12345" }, body: {} });
  const res = mockRes();
  await executePostRoute(req, res);
  const html = res._chunks.html;
  assert.match(html, /Execution error/i);
  assert.match(html, /nonexistent/);
});

test("execute POST — missing required arg shows error", async () => {
  const mocks = getMocks();
  mocks.db.query = async (sql, params) => {
    if (sql.includes("p.oid")) return { rows: [SAMPLE_ROUTINES[1]], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const { executePostRoute } = require("../routes/execute");
  // arg_0 is missing (required), arg_1 is provided
  const req = mockReq({ params: { oid: "12346" }, body: { arg_1: "4" } });
  const res = mockRes();
  await executePostRoute(req, res);
  const html = res._chunks.html;
  assert.match(html, /Missing required argument/i);
});

test("parseArgValue coerces types correctly", () => {
  delete require.cache[require.resolve("../routes/execute")];
  const { parseArgValue } = require("../routes/execute");
  assert.equal(parseArgValue("true", "boolean"), true);
  assert.equal(parseArgValue("false", "boolean"), false);
  assert.equal(parseArgValue("", "boolean"), null);
  assert.equal(parseArgValue("42", "integer"), 42);
  assert.equal(parseArgValue("3.14", "numeric"), 3.14);
  assert.equal(parseArgValue("", "integer"), null);
  assert.equal(parseArgValue("hello", "text"), "hello");
  assert.deepEqual(parseArgValue('{"a":1}', "jsonb"), { a: 1 });
});

/* ------------------------------------------------------------------ */
/*  Placeholder route                                                  */
/* ------------------------------------------------------------------ */

test("placeholder route renders coming-soon message", async () => {
  const placeholder = require("../routes/placeholder");
  const handler = placeholder("Execute routine", "Routine execution is planned for a later milestone.");
  const req = mockReq({ params: { oid: "12345" } });
  const res = mockRes();
  await handler(req, res);
  const html = res._chunks.html;
  assert.match(html, /planned for a later milestone/i);
});

/* ------------------------------------------------------------------ */
/*  DBCodeConsole viewtemplate                                         */
/* ------------------------------------------------------------------ */

test("DBCodeConsole.run rejects non-admin", async () => {
  const mocks = getMocks();
  mocks.db.query = async () => ({ rows: SAMPLE_ROUTINES, rowCount: 3 });
  const dbCodeConsole = require("../viewtemplates/db-code-console");
  const html = await dbCodeConsole.run(null, "DB Code", {}, {}, {
    req: { user: { role_id: 2 } },
  });
  assert.match(html, /administrators only/i);
});

test("DBCodeConsole.run renders list when no routine_oid in state", async () => {
  const mocks = getMocks();
  mocks.db.query = async () => ({ rows: SAMPLE_ROUTINES, rowCount: 3 });
  const dbCodeConsole = require("../viewtemplates/db-code-console");
  const html = await dbCodeConsole.run(null, "DB Code", {}, {}, {
    req: mockReq(),
  });
  assert.match(html, /hello/);
  assert.match(html, /add_nums/);
  assert.match(html, /do_thing/);
});

test("DBCodeConsole.run renders detail when routine_oid provided", async () => {
  const mocks = getMocks();
  mocks.db.query = async (sql, params) => {
    if (sql.includes("p.oid")) return { rows: [SAMPLE_ROUTINES[1]], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const dbCodeConsole = require("../viewtemplates/db-code-console");
  const html = await dbCodeConsole.run(null, "DB Code", {}, { routine_oid: 12346 }, {
    req: mockReq(),
  });
  assert.match(html, /add_nums/);
  assert.match(html, /CREATE OR REPLACE FUNCTION/);
});

test("DBCodeConsole is tableless", () => {
  const dbCodeConsole = require("../viewtemplates/db-code-console");
  assert.equal(dbCodeConsole.tableless, true);
});

test("DBCodeConsole has configuration_workflow", () => {
  const dbCodeConsole = require("../viewtemplates/db-code-console");
  assert.equal(typeof dbCodeConsole.configuration_workflow, "function");
  const wf = dbCodeConsole.configuration_workflow();
  assert.ok(wf, "Should return a workflow");
});

test("DBCodeConsole has get_state_fields", () => {
  const dbCodeConsole = require("../viewtemplates/db-code-console");
  assert.equal(typeof dbCodeConsole.get_state_fields, "function");
  const fields = dbCodeConsole.get_state_fields();
  assert.ok(Array.isArray(fields));
  assert.ok(fields.some(f => f.name === "routine_oid"));
  assert.ok(fields.some(f => f.name === "kind"));
});

/* ------------------------------------------------------------------ */
/*  HTML helpers                                                       */
/* ------------------------------------------------------------------ */

test("escapeHtml escapes dangerous characters", () => {
  const { escapeHtml } = require("../lib/html");
  assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.equal(escapeHtml("a & b"), "a &amp; b");
  assert.equal(escapeHtml("it's"), "it&#39;s");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("page uses sendWrap when available", () => {
  const { page } = require("../lib/html");
  let wrapCalled = false;
  const res = mockRes({
    sendWrap: () => { wrapCalled = true; },
  });
  const req = mockReq();
  page(req, res, "Test", "<p>Hello</p>");
  assert.ok(wrapCalled, "Should call sendWrap");
});

test("page falls back to res.send when sendWrap unavailable", () => {
  const { page } = require("../lib/html");
  const res = { send: (html) => {} };
  const req = mockReq();
  // Should not throw
  page(req, res, "Test", "<p>Hello</p>");
});

/* ------------------------------------------------------------------ */
/*  View context URL generation                                        */
/* ------------------------------------------------------------------ */

test("view-context helpers build correct URLs", () => {
  const { listViewHref, detailViewHref, routeHref } = require("../lib/view-context");

  // Without viewBaseUrl — falls back to /db-code routes
  assert.equal(listViewHref(null), "/db-code");
  assert.equal(listViewHref(null, "function"), "/db-code?kind=function");
  assert.equal(detailViewHref(null, 123), "/db-code/routine/123");
  assert.equal(routeHref("/db-code/new", null), "/db-code/new");

  // With viewBaseUrl — uses view URLs
  assert.equal(listViewHref("/view/MyConsole"), "/view/MyConsole");
  assert.equal(listViewHref("/view/MyConsole", "procedure"), "/view/MyConsole?kind=procedure");
  assert.equal(detailViewHref("/view/MyConsole", 123), "/view/MyConsole?routine_oid=123");
  assert.equal(routeHref("/db-code/new", "/view/MyConsole"), "/db-code/new?view_base_url=%2Fview%2FMyConsole");
});

test("list view generates view-context links when useViewState=true", async () => {
  const mocks = getMocks();
  mocks.db.query = async () => ({ rows: SAMPLE_ROUTINES, rowCount: 3 });
  delete require.cache[require.resolve("../lib/render-routines")];
  const { renderRoutineList } = require("../lib/render-routines");
  const html = await renderRoutineList({ baseUrl: "/view/MyConsole", useViewState: true, kind: "" });
  // View links should use the view URL
  assert.match(html, /href="\/view\/MyConsole\?routine_oid=12345"/, "View button should use view URL");
  // New/action buttons should pass view_base_url
  assert.match(html, /view_base_url=%2Fview%2FMyConsole/, "New button should carry view_base_url");
  // Edit button should pass view_base_url
  assert.match(html, /\/db-code\/routine\/12345\/edit\?view_base_url=/, "Edit button should carry view_base_url");
});

test("detail view generates view-context links when useViewState=true", async () => {
  const mocks = getMocks();
  mocks.db.query = async (sql, params) => {
    if (sql.includes("p.oid")) return { rows: [SAMPLE_ROUTINES[0]], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  delete require.cache[require.resolve("../lib/render-routines")];
  const { renderRoutineDetail } = require("../lib/render-routines");
  const html = await renderRoutineDetail(12345, { baseUrl: "/view/MyConsole", useViewState: true });
  // Back link should go to view list
  assert.match(html, /href="\/view\/MyConsole"/, "Back link should use view URL");
  // Edit button should carry view_base_url
  assert.match(html, /\/db-code\/routine\/12345\/edit\?view_base_url=/, "Edit button should carry view_base_url");
  // Delete button should carry view_base_url
  assert.match(html, /\/db-code\/routine\/12345\/delete\?view_base_url=/, "Delete button should carry view_base_url");
});

test("create form respects view_base_url from query", async () => {
  const { createFormRoute } = require("../routes/create");
  const req = mockReq({ query: { view_base_url: "/view/MyConsole" } });
  const res = mockRes();
  await createFormRoute(req, res);
  const html = res._chunks.html;
  // Cancel/back link should go to view
  assert.match(html, /href="\/view\/MyConsole"/, "Back link should use view URL");
  // Hidden field should carry view_base_url
  assert.match(html, /name="view_base_url" value="\/view\/MyConsole"/, "Should have hidden view_base_url input");
});

test("create POST redirects to view URL after success", async () => {
  const mocks = getMocks();
  const queries = [];
  mocks.db.query = async (sql) => { queries.push(sql); return { rows: [], rowCount: 0 }; };
  const { createPostRoute } = require("../routes/create");
  const req = mockReq({
    body: {
      name: "test_fn",
      argumentsSql: "",
      returnType: "integer",
      language: "sql",
      volatility: "IMMUTABLE",
      security: "INVOKER",
      body: "SELECT 1",
      view_base_url: "/view/MyConsole",
    },
  });
  const res = mockRes();
  await createPostRoute(req, res);
  assert.ok(res._chunks.redirectUrl, "Should redirect");
  assert.match(res._chunks.redirectUrl, /\/view\/MyConsole/, "Should redirect to view URL");
});

test("edit form respects view_base_url", async () => {
  const mocks = getMocks();
  mocks.db.query = async (sql, params) => {
    if (sql.includes("p.oid")) return { rows: [SAMPLE_ROUTINES[0]], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const { editFormRoute } = require("../routes/edit");
  const req = mockReq({ params: { oid: "12345" }, query: { view_base_url: "/view/MyConsole" } });
  const res = mockRes();
  await editFormRoute(req, res);
  const html = res._chunks.html;
  // Back/Cancel should go to view detail
  assert.match(html, /href="\/view\/MyConsole\?routine_oid=12345"/, "Back link should use view detail URL");
  assert.match(html, /name="view_base_url" value="\/view\/MyConsole"/, "Should have hidden view_base_url input");
});

test("edit POST redirects to view detail URL after success", async () => {
  const mocks = getMocks();
  mocks.db.query = async (sql, params) => {
    if (sql.includes("p.oid")) return { rows: [SAMPLE_ROUTINES[0]], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const { editPostRoute } = require("../routes/edit");
  const ddl = 'CREATE OR REPLACE FUNCTION "public".hello() RETURNS text LANGUAGE sql AS $$SELECT \'world\'$$;';
  const req = mockReq({ params: { oid: "12345" }, body: { ddl, view_base_url: "/view/MyConsole" } });
  const res = mockRes();
  await editPostRoute(req, res);
  assert.match(res._chunks.redirectUrl, /\/view\/MyConsole\?routine_oid=12345/, "Should redirect to view detail URL");
});

test("delete POST redirects to view URL after success", async () => {
  const mocks = getMocks();
  mocks.db.query = async (sql, params) => {
    if (sql.includes("pg_describe_object")) return { rows: [], rowCount: 0 };
    if (sql.includes("p.oid")) return { rows: [SAMPLE_ROUTINES[0]], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const { deletePostRoute } = require("../routes/delete");
  const req = mockReq({ params: { oid: "12345" }, body: { confirmName: "hello", view_base_url: "/view/MyConsole" } });
  const res = mockRes();
  await deletePostRoute(req, res);
  assert.match(res._chunks.redirectUrl, /\/view\/MyConsole/, "Should redirect to view list URL");
});

/* ------------------------------------------------------------------ */
/*  Export / Import                                                    */
/* ------------------------------------------------------------------ */

test("export-import helpers: buildExportPack and validateImportPack", () => {
  const { buildExportPack, validateImportPack, PACK_FORMAT } = require("../lib/export-import");
  const routines = [
    { name: "fn1", kind: "function", identity_arguments: "", arguments: "", result_type: "text", language: "sql", volatility: "IMMUTABLE", prosecdef: false, input_args: [], description: "A test function", definition: "CREATE OR REPLACE FUNCTION public.fn1() ..." },
    { name: "proc1", kind: "procedure", identity_arguments: "x integer", arguments: "x integer", result_type: null, language: "plpgsql", volatility: "VOLATILE", prosecdef: true, input_args: [{ position: 1, name: "x", type: "integer" }], description: null, definition: "CREATE OR REPLACE PROCEDURE public.proc1(x integer) ..." },
  ];
  const pack = buildExportPack(routines, "public");
  assert.equal(pack.format, PACK_FORMAT);
  assert.equal(pack.version, 1);
  assert.equal(pack.source_schema, "public");
  assert.equal(pack.routines.length, 2);
  assert.equal(pack.routines[0].name, "fn1");
  assert.equal(pack.routines[1].kind, "procedure");
  // Validate succeeds
  const v = validateImportPack(pack);
  assert.equal(v.valid, true);
  assert.deepEqual(v.pack, pack);
});

test("validateImportPack rejects invalid packs", () => {
  const { validateImportPack } = require("../lib/export-import");
  // Not an object
  assert.equal(validateImportPack(null).valid, false);
  assert.equal(validateImportPack("string").valid, false);
  // Wrong format
  assert.equal(validateImportPack({ format: "other", version: 1, routines: [] }).valid, false);
  // Missing routines
  assert.equal(validateImportPack({ format: "saltcorn-db-code-routines", version: 1 }).valid, false);
  // Routine without name
  assert.equal(validateImportPack({ format: "saltcorn-db-code-routines", version: 1, routines: [{ kind: "function", ddl: "..." }] }).valid, false);
  // Routine without ddl
  assert.equal(validateImportPack({ format: "saltcorn-db-code-routines", version: 1, routines: [{ name: "x", kind: "function" }] }).valid, false);
  // Future version
  assert.equal(validateImportPack({ format: "saltcorn-db-code-routines", version: 999, routines: [{ name: "x", kind: "function", ddl: "..." }] }).valid, false);
});

test("remapSchemaInDdl replaces schema references", () => {
  const { remapSchemaInDdl } = require("../lib/export-import");
  const ddl = 'CREATE OR REPLACE FUNCTION "public".hello() RETURNS text LANGUAGE sql AS $$SELECT 1$$;';
  const remapped = remapSchemaInDdl(ddl, "public", "tenant1");
  assert.ok(remapped.includes('"tenant1".hello'), `Should remap quoted schema: ${remapped}`);
  // Same schema — no change
  const unchanged = remapSchemaInDdl(ddl, "public", "public");
  assert.equal(unchanged, ddl);
});

test("export form route renders routine checkboxes", async () => {
  const mocks = getMocks();
  mocks.db.query = async () => ({ rows: SAMPLE_ROUTINES, rowCount: 3 });
  const { exportFormRoute } = require("../routes/export");
  const req = mockReq();
  const res = mockRes();
  await exportFormRoute(req, res);
  const html = res._chunks.html;
  assert.ok(html, "Should render HTML");
  assert.match(html, /Export routines/, "Should have title");
  assert.match(html, /name="export_0"/, "Should have checkboxes");
  assert.match(html, /hello/, "Should show routine names");
});

test("export form rejects non-admin", async () => {
  getMocks(); // ensure db mock is active for module loading
  const { exportFormRoute } = require("../routes/export");
  const req = mockReq({ user: { role_id: 2 } });
  const res = mockRes();
  await exportFormRoute(req, res);
  assert.equal(res._chunks.statusCode, 403, "Should return 403 for non-admin");
});

test("export POST generates JSON download", async () => {
  const mocks = getMocks();
  mocks.db.query = async () => ({ rows: SAMPLE_ROUTINES, rowCount: 3 });
  const { exportPostRoute } = require("../routes/export");
  const req = mockReq({ body: { export_0: "12345", export_1: "12347" } });
  const res = mockRes();
  await exportPostRoute(req, res);
  // Should set JSON headers
  assert.equal(res._chunks.json, null, "Should not use json()");
  // The send() method stores in html — check it's JSON
  const sent = res._chunks.html;
  assert.ok(sent, "Should send content");
  const parsed = JSON.parse(sent);
  assert.equal(parsed.format, "saltcorn-db-code-routines");
  assert.equal(parsed.routines.length, 2);
  assert.equal(parsed.routines[0].name, "hello");
  assert.equal(parsed.routines[1].name, "do_thing");
});

test("export POST with no selection re-renders form", async () => {
  const mocks = getMocks();
  mocks.db.query = async () => ({ rows: SAMPLE_ROUTINES, rowCount: 3 });
  const { exportPostRoute } = require("../routes/export");
  const req = mockReq({ body: {} });
  const res = mockRes();
  await exportPostRoute(req, res);
  assert.match(res._chunks.html, /Export routines/, "Should re-render form");
});

test("import form route renders upload form", async () => {
  const { importFormRoute } = require("../routes/import");
  const req = mockReq();
  const res = mockRes();
  await importFormRoute(req, res);
  const html = res._chunks.html;
  assert.ok(html, "Should render HTML");
  assert.match(html, /Import routines/, "Should have title");
  assert.match(html, /type="file"/, "Should have file input");
});

test("import form rejects non-admin", async () => {
  getMocks(); // ensure db mock is active for module loading
  const { importFormRoute } = require("../routes/import");
  const req = mockReq({ user: { role_id: 2 } });
  const res = mockRes();
  await importFormRoute(req, res);
  assert.equal(res._chunks.statusCode, 403, "Should return 403 for non-admin");
});

test("import POST with no file shows warning", async () => {
  const { importPostRoute } = require("../routes/import");
  const req = mockReq({ files: {}, body: {} });
  const res = mockRes();
  await importPostRoute(req, res);
  assert.match(res._chunks.html, /No file uploaded/, "Should show warning");
});

test("import POST with invalid JSON shows error", async () => {
  const { importPostRoute } = require("../routes/import");
  const req = mockReq({ files: { packfile: { data: Buffer.from("not json") } }, body: {} });
  const res = mockRes();
  await importPostRoute(req, res);
  assert.match(res._chunks.html, /Invalid JSON/, "Should show JSON parse error");
});

test("import POST with valid pack shows preview", async () => {
  const { importPostRoute } = require("../routes/import");
  const pack = {
    format: "saltcorn-db-code-routines",
    version: 1,
    exported_at: "2026-05-09T00:00:00Z",
    source_schema: "public",
    routines: [
      { name: "test_fn", kind: "function", identity_arguments: "", arguments: "", result_type: "text", language: "sql", volatility: "VOLATILE", security_definer: false, input_args: [], description: null, ddl: "CREATE OR REPLACE FUNCTION public.test_fn() RETURNS text LANGUAGE sql AS $$SELECT 'hi'$$;" },
    ],
  };
  const req = mockReq({ files: { packfile: { data: Buffer.from(JSON.stringify(pack)) } }, body: {} });
  const res = mockRes();
  await importPostRoute(req, res);
  const html = res._chunks.html;
  assert.match(html, /Import preview/, "Should show preview");
  assert.match(html, /test_fn/, "Should show routine name");
  assert.match(html, /import_0/, "Should have selection checkbox");
});

test("import POST rejects wrong format pack", async () => {
  const { importPostRoute } = require("../routes/import");
  const badPack = { format: "wrong", version: 1, routines: [] };
  const req = mockReq({ files: { packfile: { data: Buffer.from(JSON.stringify(badPack)) } }, body: {} });
  const res = mockRes();
  await importPostRoute(req, res);
  assert.match(res._chunks.html, /Unrecognised format/, "Should show format error");
});

test("import execute route runs DDLs and shows results", async () => {
  const mocks = getMocks();
  const queries = [];
  mocks.db.query = async (sql) => { queries.push(sql); return { rows: [], rowCount: 0 }; };
  const { importExecuteRoute } = require("../routes/import");
  const pack = {
    format: "saltcorn-db-code-routines",
    version: 1,
    source_schema: "public",
    routines: [
      { name: "fn_ok", kind: "function", ddl: "CREATE OR REPLACE FUNCTION public.fn_ok() RETURNS text LANGUAGE sql AS $$SELECT 'ok'$$;" },
      { name: "fn_skip", kind: "function", ddl: "CREATE OR REPLACE FUNCTION public.fn_skip() RETURNS text LANGUAGE sql AS $$SELECT 'skip'$$;" },
    ],
  };
  const req = mockReq({ body: { pack_json: JSON.stringify(pack), import_0: "1" /* only first */ } });
  const res = mockRes();
  await importExecuteRoute(req, res);
  const html = res._chunks.html;
  assert.match(html, /Import results/, "Should show results");
  assert.match(html, /fn_ok/, "Should show first routine");
  assert.match(html, /fn_skip/, "Should show second routine");
  // Only first DDL was executed
  assert.equal(queries.length, 1);
  assert.match(queries[0], /fn_ok/);
});

test("import execute handles DDL errors gracefully", async () => {
  const mocks = getMocks();
  let callCount = 0;
  mocks.db.query = async (sql) => {
    callCount++;
    if (sql.includes("fn_bad")) throw new Error("syntax error at or near SELECTT");
    return { rows: [], rowCount: 0 };
  };
  const { importExecuteRoute } = require("../routes/import");
  const pack = {
    format: "saltcorn-db-code-routines",
    version: 1,
    source_schema: "public",
    routines: [
      { name: "fn_ok", kind: "function", ddl: "CREATE OR REPLACE FUNCTION public.fn_ok() RETURNS text LANGUAGE sql AS $$SELECT 'ok'$$;" },
      { name: "fn_bad", kind: "function", ddl: "CREATE OR REPLACE FUNCTION public.fn_bad() RETURNS text LANGUAGE sql AS $$SELECTT 'bad'$$;" },
    ],
  };
  const req = mockReq({ body: { pack_json: JSON.stringify(pack), import_0: "1", import_1: "1" } });
  const res = mockRes();
  await importExecuteRoute(req, res);
  const html = res._chunks.html;
  assert.match(html, /fn_ok/);
  assert.match(html, /fn_bad/);
  assert.match(html, /syntax error/);
});

test("list view shows Export and Import buttons", async () => {
  const mocks = getMocks();
  mocks.db.query = async () => ({ rows: SAMPLE_ROUTINES, rowCount: 3 });
  delete require.cache[require.resolve("../lib/render-routines")];
  const { renderRoutineList } = require("../lib/render-routines");
  const html = await renderRoutineList({ showWriteActions: true });
  assert.match(html, /href="\/db-code\/export"/, "Should have Export button");
  assert.match(html, /href="\/db-code\/import"/, "Should have Import button");
});
