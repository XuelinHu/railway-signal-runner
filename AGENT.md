# AGENT.md

## Project

- Project: `railway-signal-runner`
- Stack: Vue 3, Vite, CesiumJS, Three.js, Cannon, Dexie, Pinia
- Backend: Node + Express 5 (ESM), PostgreSQL 16, Ollama
- Type: first-person railway signal inspection/training platform

## Runtime

- Frontend port: `4029`.
- Backend API port: `8038` (FRP maps it to public `47.120.48.245:18038`).
- Local URL: `http://127.0.0.1:4029/`.
- FRP URL: `http://47.120.48.245:14029/`.
- Dev: `npm run dev`.
- Build: `npm run build`.
- Preview: `npm run preview`.
- API: `npm run api` (or `npm run api:dev` for `node --watch`).
- First deploy: `npm run db:init` then `npm run seed:admin -- --username admin --password '<strong>'`.
- Demo data (idempotent, `demo-` prefixed): `npm run seed:demo`.
- The browser only ever talks to `:4029/api/*`; Vite proxies it to `:8038` in **both** dev and preview.
  The proxy strips the `Origin` header — Ollama 0.19 returns `403` for requests that carry one.

## Data Storage

- Active browser DB: IndexedDB via Dexie (`railway-signal-runner`, stores `scenes` and `records`).
  Still used when offline / not logged in, so the teacher and student flows keep working without the backend.
- PostgreSQL **is** wired into the runtime now — the API reads and writes it directly.
- PostgreSQL database name: `railway_signal_runner`; init script: `scripts/init-postgres.mjs`.
- Tables: `users`, `refresh_tokens`, `password_reset_tokens`, `login_logs`, `ai_conversations`,
  `ai_messages`, `ai_request_logs`, `system_settings`, `audit_logs`, plus the extended
  `training_scenes` and `training_records`.
- Connection env vars: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`.
  Copy `server/env.example` to `server/.env` and fill it in; `server/.env` is gitignored and must never be committed.
- Model discovery reads `GET {OLLAMA_BASE_URL}/api/tags` first, then falls back to scanning the
  manifests directory. On this machine `OLLAMA_MODELS` is unset and Ollama runs as the `ollama`
  systemd user, so the live directory is `/usr/share/ollama/.ollama/models`.

## Codex Notes

- Preserve existing uncommitted user work and generated assets.
- PostgreSQL is wired to the runtime — do not describe it as optional or unused.
- If storage behavior changes, update README and this file.

## GitHub Commit Language

- Use English for all GitHub commit messages and pull/push related commit notes.
