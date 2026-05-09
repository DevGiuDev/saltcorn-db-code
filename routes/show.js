const { requireAdmin } = require("../lib/auth");
const { page } = require("../lib/html");
const { renderRoutineDetail } = require("../lib/render-routines");

async function showRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  page(req, res, "DB Code routine", await renderRoutineDetail(req.params.oid));
}

module.exports = showRoute;
