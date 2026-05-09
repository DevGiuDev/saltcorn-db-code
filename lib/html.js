function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function page(req, res, title, body) {
  const html = `<div class="container mt-4 db-code-plugin"><h1>${escapeHtml(title)}</h1>${body}</div>`;
  if (res && typeof res.sendWrap === "function") return res.sendWrap(title, html);
  return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="/static_assets/bootstrap.min.css"></head><body>${html}</body></html>`);
}

module.exports = { escapeHtml, page };
