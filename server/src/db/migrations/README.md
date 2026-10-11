# Database migrations

Add schema changes as numbered SQL files such as `002_add_scene_tags.sql`.
Applied migration files are immutable because their SHA-256 checksums are stored
in `schema_migrations`. The existing idempotent `schema.sql` is recorded once as
the `001_initial_schema` baseline for databases initialized before this ledger.
