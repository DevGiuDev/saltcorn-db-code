/**
 * Mock helper for Saltcorn data modules.
 *
 * Patches Module._resolveFilename to redirect @saltcorn/data/* requires
 * to tiny shim files, then pre-populates require.cache with configurable
 * mock objects so tests can override db.query, etc.
 *
 * Usage:
 *   const { setup, teardown, getMocks } = require("./__mocks__/mock-saltcorn");
 *   setup();
 *   const { db, state } = getMocks();
 *   db.query.mockImplementation(() => ({ rows: [] }));
 *   // ... run tests ...
 *   teardown();
 */

const Module = require("module");
const path = require("path");
const fs = require("fs");

const MOCKS_DIR = __dirname;

const RESOLVE_MAP = {
  "@saltcorn/data/db": "saltcorn-data-db.js",
  "@saltcorn/data/db/state": "saltcorn-data-state.js",
  "@saltcorn/data/models/workflow": "saltcorn-data-workflow.js",
};

const originalResolveFilename = Module._resolveFilename;

// Shared mutable mock objects — tests can configure them.
let mocks = null;
let active = false;

function createMocks() {
  return {
    db: {
      isSQLite: false,
      getTenantSchema: () => "public",
      query: async () => ({ rows: [], rowCount: 0 }),
    },
    state: {
      getState: () => ({ functions: {} }),
    },
    // Workflow is used as a constructor: const Workflow = require(...); new Workflow({steps: []})
    workflow: class Workflow {
      constructor(cfg) { Object.assign(this, cfg); }
    },
  };
}

function ensureShimFiles() {
  // Write tiny shim files so the resolver can point to real files on disk.
  for (const basename of Object.values(RESOLVE_MAP)) {
    const filePath = path.join(MOCKS_DIR, basename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "// shim — cache is pre-populated\nmodule.exports = {};\n", "utf8");
    }
  }
}

function setup() {
  if (active) return;
  active = true;
  mocks = createMocks();
  ensureShimFiles();

  // Patch resolution to redirect to our shim files.
  Module._resolveFilename = function patchedResolve(request, parent, isMain, options) {
    if (RESOLVE_MAP[request]) {
      return path.join(MOCKS_DIR, RESOLVE_MAP[request]);
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };

  // Pre-populate require.cache with our mock objects so require() returns
  // the mocks instead of executing the shim file.
  for (const [specifier, basename] of Object.entries(RESOLVE_MAP)) {
    const filePath = path.join(MOCKS_DIR, basename);
    require.cache[filePath] = {
      id: filePath,
      path: MOCKS_DIR,
      filename: filePath,
      loaded: true,
      children: [],
      exports: getMockForSpecifier(specifier),
    };
  }
}

function getMockForSpecifier(specifier) {
  if (specifier === "@saltcorn/data/db") return mocks.db;
  if (specifier === "@saltcorn/data/db/state") return mocks.state;
  if (specifier === "@saltcorn/data/models/workflow") return mocks.workflow;
  return {};
}

function teardown() {
  if (!active) return;
  active = false;
  mocks = null;

  Module._resolveFilename = originalResolveFilename;

  // Purge cached plugin modules and mock shims.
  for (const key of Object.keys(require.cache)) {
    if (key.includes("saltcorn-db-code") || key.includes(MOCKS_DIR)) {
      delete require.cache[key];
    }
  }
}

function getMocks() {
  if (!mocks) throw new Error("Call setup() before getMocks()");
  return mocks;
}

module.exports = { setup, teardown, getMocks };
