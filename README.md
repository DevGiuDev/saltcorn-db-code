# Saltcorn DB Code

Saltcorn DB Code is a Saltcorn plugin for inspecting and managing PostgreSQL database code objects from the Saltcorn UI.

The MVP is PostgreSQL-only and currently supports:

- List functions and procedures in the current tenant schema.
- View routine metadata.
- View the full SQL definition returned by PostgreSQL.
- Create functions with a structured form and Saltcorn's code editor for the function body.
- Restrict access to Saltcorn administrators.
- Show a clear unsupported-database message on SQLite.

## Local installation during development

From the Saltcorn checkout:

```bash
cd /home/devgiu/dev/saltcorn
./packages/saltcorn-cli/bin/saltcorn dev:localize-plugin db-code /home/devgiu/dev/saltcorn-db-code
```

After loading the plugin, create a Saltcorn view with the `DBCodeConsole` view pattern. This is the recommended entrypoint because it behaves like other Saltcorn plugin consoles and can be added to menus normally.

Alternative direct route for development:

```txt
/db-code
```

Administrators can add either the created view URL, usually `/view/<view-name>`, or the direct `/db-code` route to a normal Saltcorn menu link.

## Development commands

```bash
npm test
npm run lint
```

## Scope

The first milestone is read-only PostgreSQL routines. Creation, editing, deletion, execution, configuration, and additional database object types are tracked in `PLAN.md` and `docs/TODO.md`.
