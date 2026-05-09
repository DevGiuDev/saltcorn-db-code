# TODO: Saltcorn DB Code

## Current milestone: read-only PostgreSQL routines

- [x] Initialize the plugin repository structure.
- [x] Add a basic Saltcorn plugin export.
- [x] Add `DBCodeConsole` tableless view pattern as the recommended Saltcorn entrypoint.
- [x] Add `/db-code` route for routine listing as a development/direct route.
- [x] Add `/db-code/routine/:oid` route for routine details as a development/direct route.
- [x] Restrict routes to Saltcorn administrators.
- [x] Resolve the current Saltcorn tenant schema through Saltcorn DB APIs.
- [x] Block SQLite with a clear unsupported-database message.
- [x] Add initial SQL builder and validation helpers for later write milestones.
- [ ] Validate the routes inside a running Saltcorn development instance.
- [ ] Add integration tests through Saltcorn plugin test tooling.

## Next milestone: creation workflow

- [ ] Build a structured function creation form.
- [ ] Keep CSRF protection enabled for POST routes.
- [ ] Validate function names, allowed languages, volatility, and security mode.
- [ ] Execute `CREATE OR REPLACE FUNCTION` only in the tenant schema.
- [ ] Add readable flash or inline errors.

## Later milestones

- [ ] Safe edit workflow that preserves function identity.
- [ ] Safe delete workflow without default `CASCADE`.
- [ ] Function execution/testing UI with prepared parameters.
- [ ] Plugin configuration workflow.
- [ ] Trigger and view management research.
