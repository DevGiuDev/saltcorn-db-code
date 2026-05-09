const Workflow = require("@saltcorn/data/models/workflow");
const { renderRoutineList, renderRoutineDetail } = require("../lib/render-routines");

const configuration_workflow = () => new Workflow({ steps: [] });

const get_state_fields = () => [
  {
    name: "routine_oid",
    type: "Integer",
    required: false
  }
];

const run = async (tableId, viewname, configuration, state, { req }) => {
  if (!req || !req.user || req.user.role_id !== 1) {
    return `<div class="alert alert-danger">DB Code Console is available to administrators only.</div>`;
  }

  const baseUrl = `/view/${encodeURIComponent(viewname)}`;
  if (state && state.routine_oid) {
    return renderRoutineDetail(state.routine_oid, { baseUrl, useViewState: true, showWriteActions: true });
  }
  return renderRoutineList({ baseUrl, useViewState: true, showWriteActions: true });
};

module.exports = {
  name: "DBCodeConsole",
  display_name: "DB Code Console",
  description: "Administrative console for PostgreSQL routines in the current Saltcorn tenant schema.",
  tableless: true,
  configuration_workflow,
  get_state_fields,
  run
};
