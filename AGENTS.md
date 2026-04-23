# Coding Standards for Challenge 1 Migrations

## SQL Migration Standards

1. **File Naming:**
   - Format: `NNN_description_up.sql` and `NNN_description_down.sql`
   - Example: `001_create_book_engagement_up.sql`
   - Increment NNN sequentially (001, 002, 003, etc.)

2. **UP Migration Requirements:**
   - CREATE TABLE or ALTER TABLE statements
   - Explicit column types: BIGSERIAL, UUID, INT, DECIMAL, VARCHAR, TIMESTAMP, BOOLEAN, TEXT
   - PRIMARY KEY: id BIGSERIAL PRIMARY KEY (for new tables)
   - FOREIGN KEY: References with ON DELETE CASCADE where appropriate
   - Timestamps: Every table has created_at and updated_at with CURRENT_TIMESTAMP defaults
   - Indexes: On foreign keys, timestamps, and other frequently queried columns
   - Constraints: NOT NULL, UNIQUE, CHECK constraints as needed
   - Permissions: GRANT SELECT, INSERT, UPDATE, DELETE to gacs_user
   - Comments: /* Table description */ above CREATE statements

3. **DOWN Migration Requirements:**
   - DROP TABLE IF EXISTS ... CASCADE for tables
   - ALTER TABLE DROP COLUMN IF EXISTS for column additions
   - Reverse order of creation
   - Handle dependent objects

4. **Special Rules:**
   - No transactions in DDL (PostgreSQL handles atomicity)
   - For ALTER TABLE: one logical change per statement
   - Column additions should include DEFAULT for existing data
   - UNIQUE constraints need explicit names: CONSTRAINT constraint_name UNIQUE(...)
   - Indexes should have descriptive names: CREATE INDEX idx_table_column ON table(column)

5. **Testing After Each Migration:**
   - Verify with \dt (list tables)
   - Verify columns with \d table_name
   - For ALTERs, check with SELECT * FROM table LIMIT 1
   - Run DOWN migration and verify with \dt

## Database Context
- Database: gacs_staging
- Host: staging.gacs.internal
- User: gacs_user
- Port: 5432
- Existing tables: books, video_jobs, video_queue
