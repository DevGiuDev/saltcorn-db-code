const listRoute = require("./routes/list");
const showRoute = require("./routes/show");
const placeholder = require("./routes/placeholder");
const { createFormRoute, createPostRoute } = require("./routes/create");
const dbCodeConsole = require("./viewtemplates/db-code-console");

module.exports = {
  sc_plugin_api_version: 1,
  plugin_name: "db-code",
  viewtemplates: [dbCodeConsole],
  routes: [
    { url: "/db-code", method: "get", callback: listRoute },
    { url: "/db-code/routine/:oid", method: "get", callback: showRoute },
    { url: "/db-code/new", method: "get", callback: createFormRoute },
    { url: "/db-code/new", method: "post", callback: createPostRoute },
    { url: "/db-code/routine/:oid/edit", method: "get", callback: placeholder("Edit routine", "Routine editing is planned for a later milestone.") },
    { url: "/db-code/routine/:oid/delete", method: "get", callback: placeholder("Delete routine", "Routine deletion is planned for a later milestone.") },
    { url: "/db-code/routine/:oid/execute", method: "get", callback: placeholder("Execute routine", "Routine execution is planned for a later milestone.") }
  ]
};
