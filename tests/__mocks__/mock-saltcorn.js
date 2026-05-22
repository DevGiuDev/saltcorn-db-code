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
  "@saltcorn/markup": "saltcorn-markup.js",
  "@saltcorn/markup/tags": "saltcorn-markup-tags.js",
};

const originalResolveFilename = Module._resolveFilename;

// Shared mutable mock objects — tests can configure them.
let mocks = null;
let active = false;

function createMocks() {
  // Build the markup tags mock (minimal implementation)
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  function escapeAttr(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  function mkTag(tnm, isVoid) {
    return function(attrsOrFirst, ...children) {
      let attribs = "", body = "";
      const iter = (arg) => { if (arg === undefined || arg === null || arg === false) return; if (typeof arg === "string") { body += arg; return; } if (Array.isArray(arg)) { arg.forEach(iter); return; } body += String(arg); };
      if (attrsOrFirst && typeof attrsOrFirst === "object" && !Array.isArray(attrsOrFirst)) {
        const parts = [];
        for (const [k, v] of Object.entries(attrsOrFirst)) {
          if (v === false || v === undefined || v === null) continue;
          if (k === "class") { const cs = Array.isArray(v) ? v.filter(Boolean).join(" ") : v; if (cs) parts.push(`class="${escapeAttr(cs)}"`); }
          else if (typeof v === "boolean") parts.push(k);
          else parts.push(`${k}="${escapeAttr(String(v))}"`);
        }
        attribs = parts.length ? " " + parts.join(" ") : "";
        children.forEach(iter);
      } else { [attrsOrFirst, ...children].forEach(iter); }
      return isVoid ? `<${tnm}${attribs}>` : `<${tnm}${attribs}>${body}</${tnm}>`;
    };
  }
  const tagNames = ["a","abbr","address","article","aside","audio","b","bdi","bdo","blockquote","body","button","canvas","caption","cite","code","col","colgroup","data","datalist","dd","del","details","dialog","div","dl","dt","em","fieldset","figcaption","figure","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","iframe","img","input","ins","kbd","label","legend","li","link","main","map","mark","meta","meter","nav","noscript","object","ol","optgroup","option","output","p","param","picture","pre","progress","q","rp","rt","ruby","s","samp","script","section","select","slot","small","source","span","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","title","tr","track","u","ul","video","wbr"];
  const markupTags = {};
  for (const t of tagNames) markupTags[t] = mkTag(t, voidTags.has(t));
  markupTags.text = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  markupTags.text_attr = markupTags.text;
  markupTags.domReady = (js) => `(function(f){if(document.readyState==="complete")f();else document.addEventListener('DOMContentLoaded',()=>setTimeout(f),false)})(function(){${js}});`;
  markupTags.badge = (col, lbl) => `${markupTags.span({ class: `badge bg-${col}` }, String(lbl))}\u00a0`;
  markupTags.link = (href, s, attrs) => markupTags.a({ href, ...attrs }, String(s));

  return {
    db: {
      isSQLite: false,
      getTenantSchema: () => "public",
      query: async () => ({ rows: [], rowCount: 0 }),
    },
    state: {
      getState: () => ({ functions: {} }),
    },
    workflow: class Workflow {
      constructor(cfg) { Object.assign(this, cfg); }
    },
    markupTags,
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
  if (specifier === "@saltcorn/markup/tags" || specifier === "@saltcorn/markup") return mocks.markupTags;
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
