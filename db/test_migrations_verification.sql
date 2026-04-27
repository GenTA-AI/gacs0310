/*
================================================================================
Database Migration Verification Script
================================================================================

Instructions for running this script against the staging database:

Use the psql command-line tool to execute this script against the gacs_staging
database. The connection details as per AGENTS.md are:
- Host: staging.gacs.internal
- User: gacs_user
- Port: 5432
- Database: gacs_staging

Run the following command from the project root:
psql -h staging.gacs.internal -p 5432 -U gacs_user -d gacs_staging -f db/test_migrations_verification.sql

================================================================================
*/

-- 1. List all tables created
-- Verify: book_engagement, audience_validation, did_sync_log, did_sync_state exist
\echo '>>> 1. Listing all tables...'
\dt

-- 2. Verify column additions to existing tables
\echo '>>> 2. Verifying column additions to books and video_jobs tables...'

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'books'
  AND column_name IN (
    'engagement_count',
    'last_engagement_at'
  )
ORDER BY ordinal_position;

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'video_jobs'
  AND column_name IN (
    'priority_score',
    'retry_count',
    'requested_at',
    'external_ref_id',
    'did_reported_status',
    'did_request_retries',
    'expires_at',
    'did_status_synced_at'
  )
ORDER BY ordinal_position;

-- 3. Show table structure for each new table
\echo '>>> 3. Showing table structures for new tables...'

\echo 'Table: book_engagement'
\d book_engagement

\echo 'Table: audience_validation'
\d audience_validation

\echo 'Table: did_sync_log'
\d did_sync_log

\echo 'Table: did_sync_state'
\d did_sync_state

-- 4. List all indexes
\echo '>>> 4. Listing all public indexes...'

SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 5. Show constraints on new tables
\echo '>>> 5. Showing constraints on new tables...'

SELECT table_name, constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND table_name IN (
    'book_engagement',
    'audience_validation',
    'did_sync_log',
    'did_sync_state'
  )
ORDER BY table_name, constraint_type, constraint_name;

-- 6. Verify permissions
\echo '>>> 6. Verifying permissions for gacs_user...'

SELECT table_name, privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'gacs_user'
  AND table_schema = 'public'
  AND table_name IN (
    'book_engagement',
    'audience_validation',
    'did_sync_log',
    'did_sync_state'
  )
ORDER BY table_name, privilege_type;

-- 7. Verify Smart DID sync cursor table is usable
\echo '>>> 7. Verifying did_sync_state cursor upsert...'

INSERT INTO did_sync_state (
  sync_name,
  cursor_updated_at,
  cursor_external_id,
  last_started_at,
  last_success_at,
  last_error,
  created_at,
  updated_at
)
VALUES (
  'verification.smart_did.video_records',
  NOW(),
  'verification-book-id',
  NOW(),
  NOW(),
  NULL,
  NOW(),
  NOW()
)
ON CONFLICT (sync_name)
DO UPDATE SET
  cursor_updated_at = EXCLUDED.cursor_updated_at,
  cursor_external_id = EXCLUDED.cursor_external_id,
  last_success_at = NOW(),
  last_error = NULL,
  updated_at = NOW();

SELECT sync_name, cursor_external_id, last_error
FROM did_sync_state
WHERE sync_name = 'verification.smart_did.video_records';

DELETE FROM did_sync_state
WHERE sync_name = 'verification.smart_did.video_records';

-- 8. Verify changed-only UPSERT syntax used by incremental sync
\echo '>>> 8. Verifying book_engagement changed-only UPSERT syntax...'

PREPARE verify_book_engagement_upsert (
  BIGINT,
  INTEGER,
  NUMERIC,
  TIMESTAMPTZ
) AS
INSERT INTO book_engagement (
  book_id,
  source_system,
  request_count,
  ranking_score,
  last_requested_at,
  synced_at,
  created_at,
  updated_at
)
VALUES (
  $1,
  'smart_did',
  $2,
  $3,
  $4,
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (book_id, source_system)
DO UPDATE SET
  request_count = EXCLUDED.request_count,
  ranking_score = EXCLUDED.ranking_score,
  last_requested_at = EXCLUDED.last_requested_at,
  synced_at = NOW(),
  updated_at = NOW()
WHERE book_engagement.request_count IS DISTINCT FROM EXCLUDED.request_count
   OR book_engagement.ranking_score IS DISTINCT FROM EXCLUDED.ranking_score
   OR book_engagement.last_requested_at IS DISTINCT FROM EXCLUDED.last_requested_at;

DEALLOCATE verify_book_engagement_upsert;

\echo '>>> Migration verification completed.'
