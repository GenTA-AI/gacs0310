# db/init

These files are auto-applied by the Postgres container on first boot, in alphabetical order.

- `01_base_schema.sql` — production-equivalent DDL. Treat as **read-only**. Do not modify in PRs.
- `02_seed.sql` — deterministic dummy data so tests can hard-code IDs.

Schema additions (new tables / columns) belong in your migration tooling — `db/migrations/` for raw SQL, or `migrations/` for Alembic. The base schema in this folder represents what already exists in production.

To wipe the local DB and reapply from scratch:

```bash
./scripts/db-reset.sh
```
