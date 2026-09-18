# Contributing

1. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The rules that matter most:
   GDELT is the only provider; PostgreSQL is the source of truth; OpenSearch is derived;
   no AI/LLM/translation dependencies; the app UI uses only black (#000000) and white (#FFFFFF).
2. Set up the dev environment as described in the README.
3. Backend: `npm run build && npm test` must pass. Add unit tests for pipeline logic
   (normalisation, relevance, dedup, quality, categories) with real-world examples.
4. Schema changes are new files in `apps/backend/migrations/` (never edit an applied migration).
   Changes to seeded rules/categories that must reach existing installs also need a migration.
5. Mobile: `cd apps/mobile && npm run typecheck`.
6. Never commit `.env` files, credentials or database dumps.

By contributing you agree that your contributions are licensed under Apache-2.0.
