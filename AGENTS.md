# Agent instructions for Saltcorn DB Code

- Write all code, documentation, comments, commit messages, and user-facing plugin text in English.
- Keep the plugin independent from Saltcorn core. Do not modify Saltcorn core unless explicitly requested.
- Treat PostgreSQL SQL injection as the highest-risk area:
  - Validate identifiers with strict allowlists.
  - Quote identifiers through `lib/sql-builders.js` helpers.
  - Use query parameters for data values.
  - Do not allow user-provided schemas; always use the current Saltcorn tenant schema.
- The MVP is PostgreSQL-only. SQLite must fail with a clear message.
- Only Saltcorn administrators may access plugin routes.
- Keep `docs/TODO.md` updated whenever scope or implementation status changes.
- Prefer the `DBCodeConsole` tableless view pattern as the public Saltcorn entrypoint; keep direct routes as support/development endpoints.
- Prefer small modules under `lib/`, route handlers under `routes/`, and view patterns under `viewtemplates/`.
- Run `npm test` and `npm run lint` before handing off changes when possible.
