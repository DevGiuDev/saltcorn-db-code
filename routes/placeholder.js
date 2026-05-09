const { requireAdmin } = require("../lib/auth");
const { escapeHtml, page } = require("../lib/html");

function placeholder(title, message) {
  return async function route(req, res) {
    if (!requireAdmin(req, res)) return;
    page(req, res, title, `<p><a href="/db-code">← Back to DB Code</a></p><div class="alert alert-info">${escapeHtml(message)}</div>`);
  };
}

module.exports = placeholder;
