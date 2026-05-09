const { getState } = require("@saltcorn/data/db/state");
const { requireAdmin } = require("../lib/auth");

async function generateRoutineSqlRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    const description = String(req.body?.description || "").trim();
    const existingCode = String(req.body?.existing_code || "");
    const routineType = String(req.body?.routine_type || "function");
    if (!description) return res.json({ error: "Prompt is required." });

    const copilot = getState()?.functions?.copilot_generate_javascript;
    if (!copilot?.run) return res.json({ error: "Copilot generation is not available." });

    const sqlPrompt = `Generate PostgreSQL ${routineType} SQL code for Saltcorn tenant schema. ${description}. Return SQL code only, no markdown fences.`;
    const code = await copilot.run(sqlPrompt, existingCode, null);
    return res.json({ code });
  } catch (error) {
    return res.json({ error: error.message || "AI generation failed." });
  }
}

module.exports = { generateRoutineSqlRoute };
