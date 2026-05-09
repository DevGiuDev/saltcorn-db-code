const { requireAdmin } = require("../lib/auth");
const { page } = require("../lib/html");
const { renderRoutineList } = require("../lib/render-routines");

async function listRoute({ req, res }) {
  if (!requireAdmin(req, res)) return;
  page(req, res, "DB Code", await renderRoutineList());
}

module.exports = listRoute;
