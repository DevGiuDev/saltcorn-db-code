const { getState } = require("@saltcorn/data/db/state");
const { requireAdmin } = require("../lib/auth");

/**
 * Strip markdown code fences that LLMs sometimes add despite instructions.
 * Handles ```sql ... ```, ``` ... ```, and leading/trailing whitespace.
 */
function stripMarkdownFences(text) {
  let out = String(text || "").trim();
  // Remove opening fence with optional language tag
  out = out.replace(/^```(?:sql|postgresql|plpgsql)?\s*\n?/i, "");
  // Remove closing fence
  out = out.replace(/\n?```\s*$/,
 "");
  return out.trim();
}

async function generateRoutineSqlRoute(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    const description = String(req.body?.description || "").trim();
    const existingCode = String(req.body?.existing_code || "");
    const routineType = String(req.body?.routine_type || "function");
    if (!description) return res.json({ error: "Prompt is required." });

    const copilot = getState()?.functions?.copilot_generate_javascript;
    if (!copilot?.run) return res.json({ error: "Copilot generation is not available." });

    const sqlPrompt = [
      `You are a PostgreSQL code generator.`,
      `Task: ${description}`,
      existingCode ? `Existing code to modify:\n${existingCode}` : "",
      `Constraints:`,
      `- Output MUST be a single valid PostgreSQL ${routineType} DDL statement.`,
      `- It MUST start with CREATE OR REPLACE ${routineType === "stored procedure" ? "PROCEDURE" : "FUNCTION"}.`,
      `- Do NOT include markdown fences, comments, or any text outside the SQL statement.`,
      `- Do NOT wrap output in backticks or code blocks.`,
      `- Use dollar-quoting ($body$...$body$) for the routine body.`,
      `- Output raw SQL only. Nothing else.`,
    ].filter(Boolean).join("\n\n");
    const code = stripMarkdownFences(await copilot.run(sqlPrompt, existingCode, null));
    return res.json({ code });
  } catch (error) {
    return res.json({ error: error.message || "AI generation failed." });
  }
}

module.exports = { generateRoutineSqlRoute };
