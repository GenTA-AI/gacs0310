/**
 * Helpers for seeding and cleaning test data
 */

export async function seedBookWithRef(db, bookId, externalBookId) {
  // Insert canonical book
  // id is BIGSERIAL, but for testing we might want to specify it or let it generate
  const bookResult = await db.query(
    `INSERT INTO books (id, title, author, isbn) 
     VALUES ($1, 'Test Book', 'Test Author', $2) 
     ON CONFLICT (id) DO NOTHING RETURNING id`,
    [bookId, `isbn-${externalBookId}`]
  );
  
  // Insert external ref
  await db.query(
    `INSERT INTO book_external_refs (book_id, source_system, external_book_id, first_seen_at, last_seen_at)
     VALUES ($1, 'smart_did', $2, NOW(), NOW())
     ON CONFLICT (source_system, external_book_id) DO NOTHING`,
    [bookId, externalBookId]
  );
}

export async function seedVideoJob(db, bookId, status = 'pending') {
  await db.query(
    `INSERT INTO video_jobs (book_id, status, created_at)
     VALUES ($1, $2, NOW())`,
    [bookId, status]
  );
}

export async function cleanTestData(db) {
  // Delete in reverse dependency order
  await db.query('DELETE FROM smart_did_video_state WHERE book_id IN (SELECT id FROM books WHERE title LIKE \'Test%\')');
  await db.query('DELETE FROM book_engagement_snapshots WHERE book_id IN (SELECT id FROM books WHERE title LIKE \'Test%\')');
  await db.query('DELETE FROM book_recommendation_segments WHERE book_id IN (SELECT id FROM books WHERE title LIKE \'Test%\')');
  await db.query('DELETE FROM video_jobs WHERE book_id IN (SELECT id FROM books WHERE title LIKE \'Test%\')');
  await db.query('DELETE FROM book_external_refs WHERE external_book_id LIKE \'test-%\'');
  await db.query('DELETE FROM books WHERE title LIKE \'Test%\'');
}
