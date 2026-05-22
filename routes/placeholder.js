const { requireAdmin } = require("../lib/auth");
const { page } = require("../lib/html");
const { div, i, a, text } = require("../lib/markup-helpers");

function placeholder(title, message) {
  return async function route(req, res) {
    if (!requireAdmin(req, res)) return;
    page(req, res, title, [
      a({ href: "/db-code" }, "\u2190 Back to DB Code"),
      div({ class: "alert alert-info" }, text(message)),
    ].join(""));
  };
}

module.exports = placeholder;
