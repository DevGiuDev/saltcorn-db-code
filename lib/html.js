/**
 * HTML page wrapper for DB Code routes.
 *
 * Wraps body content in a container and sends via Saltcorn's sendWrap
 * or falls back to a raw HTML document.
 */

const { div, h1, text, text_attr } = require("./markup");

function page(req, res, title, body) {
  const html = div(
    { class: "container mt-4 db-code-plugin" },
    h1(text(title)),
    body,
  );
  if (res && typeof res.sendWrap === "function") return res.sendWrap(title, html);
  return res.send(
    `<!doctype html><html><head><meta charset="utf-8"><title>${text_attr(title)}</title><link rel="stylesheet" href="/static_assets/bootstrap.min.css"></head><body>${html}</body></html>`,
  );
}

function escapeHtml(value) {
  return text(value);
}

module.exports = { page, escapeHtml };
