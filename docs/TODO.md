# TODO: Saltcorn DB Code

## Completed: read-only PostgreSQL routines

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
- [x] Validate the routes inside a running Saltcorn development instance.
- [x] Add integration tests through Saltcorn plugin test tooling.

## Completed: creation workflow

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
- [x] Validate creation manually inside a running PostgreSQL Saltcorn tenant.

## Completed: edit workflow

- [x] Add an edit form based on the current PostgreSQL routine DDL.
- [x] Add edit actions directly in the DB Code Console list.
- [x] Improve DB Code Console UI with an Entities-like card, toolbar, badges, search, and action buttons.
- [x] Improve create/edit forms with the same card-based DB Code Console aesthetic.
- [x] Improve routine detail view with the same card-based DB Code Console aesthetic.
- [x] Use Saltcorn's code editor for edit DDL.
- [x] Validate edited DDL starts with `CREATE FUNCTION` / `CREATE PROCEDURE` and targets the current tenant schema.
- [x] Add stricter identity checks to prevent accidental overload creation.
- [x] Validate editing manually inside a running PostgreSQL Saltcorn tenant.

## Completed: delete workflow

- [x] Add delete confirmation screen.
- [x] Require typing the routine name before deletion.
- [x] Show direct dependencies from `pg_depend`.
- [x] Execute `DROP FUNCTION` / `DROP PROCEDURE` without `CASCADE`.
- [x] Validate deletion manually inside a running PostgreSQL Saltcorn tenant.

## Current milestone: function execution / testing

- [x] Build execute form with dynamic argument fields from `input_args` introspection.
- [x] Render form for zero-argument routines (direct execute button, no fields).
- [x] Support functions: `SELECT * FROM schema.func($1, $2, ...)`.
- [x] Support procedures: `CALL schema.proc($1, $2, ...)`.
- [x] Display results as a table for rowsets and as JSON for scalars.
- [x] Handle SQL errors with readable inline messages.
- [x] Show execution metadata (row count, duration).
- [x] Add execute route GET `/db-code/routine/:oid/execute`.
- [x] Add execute route POST `/db-code/routine/:oid/execute`.
- [x] Add integration tests for the execute routes.
- [ ] Validate execution manually inside a running PostgreSQL Saltcorn tenant.

## Later milestones

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

## Completed: export/import

- [x] Define JSON pack format (`saltcorn-db-code-routines` v1) with metadata + full DDL.
- [x] Export route: list routines with checkboxes, select all/none, download JSON.
- [x] Import route: upload JSON, validate format, preview routines with selection.
- [x] Import execute route: run selected DDLs, show per-routine results (ok/error/skipped).
- [x] Schema remapping: auto-remap DDL from source schema to current tenant schema on import.
- [x] Export/Import buttons in DB Code Console toolbar.
- [x] Integration tests for all export/import routes and helpers.

## Completed: security hardening (May 2026)

- [x] Harden DDL validation to require exactly one top-level CREATE FUNCTION/PROCEDURE statement.
- [x] Re-validate imported DDL against tenant schema before execution.
- [x] Sanitize `view_base_url` to prevent open redirects to external URLs.
