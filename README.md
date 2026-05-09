# Saltcorn DB Code

Saltcorn DB Code is a Saltcorn plugin for inspecting and managing PostgreSQL database code objects from the Saltcorn UI.

The MVP is PostgreSQL-only and currently focuses on read-only routine introspection:

- List functions and procedures in the current tenant schema.
- View routine metadata.
- View the full SQL definition returned by PostgreSQL.
- Restrict access to Saltcorn administrators.
- Show a clear unsupported-database message on SQLite.

## Local installation during development

From the Saltcorn checkout:

```bash
cd /home/devgiu/dev/saltcorn
./packages/saltcorn-cli/bin/saltcorn dev:localize-plugin db-code /home/devgiu/dev/saltcorn-db-code
```

After loading the plugin, open:

```txt
/db-code
```

Administrators can add a normal Saltcorn menu link to `/db-code`.

## Development commands

```bash
npm test
npm run lint
```

## Scope

The first milestone is read-only PostgreSQL routines. Creation, editing, deletion, execution, configuration, and additional database object types are tracked in `PLAN.md` and `docs/TODO.md`.
