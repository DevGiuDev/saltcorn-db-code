const listRoute = require("./routes/list");
const showRoute = require("./routes/show");
const placeholder = require("./routes/placeholder");
const { createFormRoute, createPostRoute, createProcedureFormRoute, createProcedurePostRoute, createDdlFormRoute, createDdlPostRoute } = require("./routes/create");
const { editFormRoute, editPostRoute } = require("./routes/edit");
const { deleteFormRoute, deletePostRoute } = require("./routes/delete");
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
    { url: "/db-code/new-procedure", method: "get", callback: createProcedureFormRoute },
    { url: "/db-code/new-procedure", method: "post", callback: createProcedurePostRoute },
    { url: "/db-code/new-ddl", method: "get", callback: createDdlFormRoute },
    { url: "/db-code/new-ddl", method: "post", callback: createDdlPostRoute },
    { url: "/db-code/routine/:oid/edit", method: "get", callback: editFormRoute },
    { url: "/db-code/routine/:oid/edit", method: "post", callback: editPostRoute },
    { url: "/db-code/routine/:oid/delete", method: "get", callback: deleteFormRoute },
    { url: "/db-code/routine/:oid/delete", method: "post", callback: deletePostRoute },
    { url: "/db-code/routine/:oid/execute", method: "get", callback: placeholder("Execute routine", "Routine execution is planned for a later milestone.") }
  ]
};
