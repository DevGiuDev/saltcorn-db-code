# TODO: Saltcorn DB Code

## Current milestone: read-only PostgreSQL routines

- [x] Initialize the plugin repository structure.
- [x] Add a basic Saltcorn plugin export.
- [x] Add `DBCodeConsole` tableless view pattern as the recommended Saltcorn entrypoint.
- [x] Add an empty configuration workflow so Saltcorn can finish creating the tableless view cleanly.
- [x] Add `/db-code` route for routine listing as a development/direct route.
- [x] Add `/db-code/routine/:oid` route for routine details as a development/direct route.
- [x] Restrict routes to Saltcorn administrators.
- [x] Resolve the current Saltcorn tenant schema through Saltcorn DB APIs.
- [x] Block SQLite with a clear unsupported-database message.
- [x] Add initial SQL builder and validation helpers for later write milestones.
- [ ] Validate the routes inside a running Saltcorn development instance.
- [ ] Add integration tests through Saltcorn plugin test tooling.

## Current milestone: creation workflow

- [x] Keep functions and stored procedures in the same table with a type filter.
- [x] Build a structured function creation form.
- [x] Build a structured stored procedure creation form.
- [x] Add a full DDL creation form for exact PostgreSQL `CREATE FUNCTION` / `CREATE PROCEDURE` statements.
- [x] Keep CSRF protection enabled for POST routes.
- [x] Validate function names, allowed languages, volatility, and security mode.
- [x] Add conservative validation for argument and return type SQL fragments.
- [x] Execute `CREATE OR REPLACE FUNCTION` only in the tenant schema.
- [x] Use Saltcorn's code editor for function body editing.
- [x] Wrap simple plpgsql statement bodies in a `BEGIN`/`END` block automatically.
- [x] Add readable flash or inline errors.
- [ ] Validate creation manually inside a running PostgreSQL Saltcorn tenant.

## Current milestone: edit workflow

- [x] Add an edit form based on the current PostgreSQL routine DDL.
- [x] Add edit actions directly in the DB Code Console list.
- [x] Improve DB Code Console UI with an Entities-like card, toolbar, badges, search, and action buttons.
- [x] Improve create/edit forms with the same card-based DB Code Console aesthetic.
- [x] Improve routine detail view with the same card-based DB Code Console aesthetic.
- [x] Use Saltcorn's code editor for edit DDL.
- [x] Validate edited DDL starts with `CREATE FUNCTION` / `CREATE PROCEDURE` and targets the current tenant schema.
- [ ] Add stricter identity checks to prevent accidental overload creation.
- [ ] Validate editing manually inside a running PostgreSQL Saltcorn tenant.

## Current milestone: delete workflow

- [x] Add delete confirmation screen.
- [x] Require typing the routine name before deletion.
- [x] Show direct dependencies from `pg_depend`.
- [x] Execute `DROP FUNCTION` / `DROP PROCEDURE` without `CASCADE`.
- [ ] Validate deletion manually inside a running PostgreSQL Saltcorn tenant.

## Later milestones

- [ ] Function execution/testing UI with prepared parameters.
- [ ] Plugin configuration workflow.
- [x] Plan action type `DB_Routine` for events/workflows/API_CALL/timed triggers.
- [x] Implement initial `DB_Routine` action with routine selection and positional JSON arguments.
- [x] Improve `DB_Routine` argument introspection (arity validation + named JSON object support).
- [ ] Validate `DB_Routine` manually from an `API_CALL` event.
- [ ] Revisit argument helper UX later (currently removed due instability in action config UI).
- [ ] Validate `DB_Routine` manually from a timed trigger.
- [ ] Add explicit routine allowlist/configuration before exposing broadly.
- [ ] Trigger and view management research.
- [ ] Add an `Edit with AI` button in `DB_Routine` action config, similar to `run_js_code` trigger UX, to generate SQL routine code from a prompt (using Copilot/Agents integration with project context).
- [x] Add `Edit with AI` buttons to DB Code create/edit routine pages (prompt -> SQL generation via available Copilot function).
