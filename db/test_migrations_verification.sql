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
-- Verify: book_engagement, audience_validation, did_sync_log exist
\echo '>>> 1. Listing all tables...'
\dt

-- 2. Verify column additions to existing tables
\echo '>>> 2. Verifying column additions to books and video_jobs tables...'
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'books' 
AND column_name IN ('engagement_count', 'last_engagement_at')
ORDER BY ordinal_position;

SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'video_jobs' 
AND column_name IN ('priority_score', 'retry_count')
ORDER BY ordinal_position;

-- 3. Show table structure for each new table
\echo '>>> 3. Showing table structures for new tables...'
\echo 'Table: book_engagement'
\d book_engagement

\echo 'Table: audience_validation'
\d audience_validation

\echo 'Table: did_sync_log'
\d did_sync_log

-- 4. List all indexes
\echo '>>> 4. Listing all public indexes...'
SELECT indexname 
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 5. Show constraints on new tables
\echo '>>> 5. Showing constraints on new tables...'
SELECT table_name, constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name IN ('book_engagement', 'audience_validation', 'did_sync_log')
ORDER BY table_name, constraint_type;

-- 6. Verify permissions
\echo '>>> 6. Verifying permissions for gacs_user...'
SELECT table_name, privilege_type 
FROM information_schema.table_privileges 
WHERE grantee = 'gacs_user' 
AND table_name IN ('book_engagement', 'audience_validation', 'did_sync_log')
ORDER BY table_name, privilege_type;
