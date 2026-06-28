# AGENT.md

## Project

- Project: `railway-signal-runner`
- Stack: Vue 3, Vite, CesiumJS, Three.js, Cannon, Dexie, Pinia
- Type: first-person railway signal inspection/training game

## Runtime

- Default port: `4000`.
- Local URL: `http://127.0.0.1:4000/`.
- FRP URL: `http://47.120.48.245:14000/`.
- Dev: `npm run dev`.
- Build: `npm run build`.
- Preview: `npm run preview`.

## Data Storage

- Active browser DB: IndexedDB via Dexie.
- Dexie database name: `railway-signal-runner`.
- Stores: `scenes`, `records`.
- Optional PostgreSQL init script: `scripts/init-postgres.mjs`.
- Optional PostgreSQL database name: `railway_signal_runner`.
- Optional tables: `training_scenes`, `training_records`.
- Optional env vars: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`.

## Codex Notes

- Preserve existing uncommitted user work and generated assets.
- Do not assume PostgreSQL is active for runtime unless code paths are wired to it.
- If storage behavior changes, update README and this file.

## GitHub Commit Language

- Use English for all GitHub commit messages and pull/push related commit notes.
