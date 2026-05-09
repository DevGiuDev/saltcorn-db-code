const listRoute = require("./routes/list");
const showRoute = require("./routes/show");
const placeholder = require("./routes/placeholder");
const dbCodeConsole = require("./viewtemplates/db-code-console");

module.exports = {
  sc_plugin_api_version: 1,
  plugin_name: "db-code",
  viewtemplates: [dbCodeConsole],
  routes: [
    { url: "/db-code", method: "get", callback: listRoute },
    { url: "/db-code/routine/:oid", method: "get", callback: showRoute },
    { url: "/db-code/new", method: "get", callback: placeholder("New function", "Function creation is planned for the next milestone. The current milestone is read-only introspection.") },
    { url: "/db-code/routine/:oid/edit", method: "get", callback: placeholder("Edit routine", "Routine editing is planned for a later milestone.") },
    { url: "/db-code/routine/:oid/delete", method: "get", callback: placeholder("Delete routine", "Routine deletion is planned for a later milestone.") },
    { url: "/db-code/routine/:oid/execute", method: "get", callback: placeholder("Execute routine", "Routine execution is planned for a later milestone.") }
  ]
};
