-- =============================================================================
-- Seed data — 5 fake books, 3 video_jobs, 2 book_facts.
-- Deterministic UUIDs so test assertions can hard-code IDs.
-- =============================================================================

INSERT INTO books (book_id, title, author, publisher, isbn, summary, genre, published_year, cover_image_url) VALUES
('11111111-1111-1111-1111-111111111111', 'The Curious Cat',          'Anya Lee',     'Pebble Press',    '9780000000001', 'A cat explores the neighborhood at night.',          'children',  2022, 'https://example.com/covers/curious-cat.jpg'),
('22222222-2222-2222-2222-222222222222', 'Robots Build a Garden',    'Marcus Chen',  'Future Kids',     '9780000000002', 'Two robots learn cooperation while planting seeds.', 'children',  2023, 'https://example.com/covers/robots-garden.jpg'),
('33333333-3333-3333-3333-333333333333', 'Where the Stars Sleep',    'Hana Park',    'Moonlight Books', '9780000000003', 'A bedtime story about constellations.',              'children',  2021, 'https://example.com/covers/stars-sleep.jpg'),
('44444444-4444-4444-4444-444444444444', 'Pirate Penguin',           'Sam Rivera',   'Iceberg Press',   '9780000000004', 'A penguin who dreams of being a pirate captain.',    'children',  2024, 'https://example.com/covers/pirate-penguin.jpg'),
('55555555-5555-5555-5555-555555555555', 'The Map That Wasn''t There','Jules Tan',   'Atlas Junior',    '9780000000005', 'Kids draw their own treasure map and follow it.',    'children',  2020, 'https://example.com/covers/map-not-there.jpg');

INSERT INTO video_jobs (job_id, book_id, status, video_url, started_at, completed_at) VALUES
('aaaaaaaa-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'completed', 'https://cdn.example.com/v/curious-cat.mp4',     '2026-04-01 09:00+00', '2026-04-01 09:08+00'),
('aaaaaaaa-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'completed', 'https://cdn.example.com/v/robots-garden.mp4',   '2026-04-02 10:00+00', '2026-04-02 10:09+00'),
('aaaaaaaa-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 'pending',   NULL,                                              NULL,                  NULL);

INSERT INTO book_facts (fact_id, book_id, job_id, themes, mood, target_audience) VALUES
('bbbbbbbb-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-1111-1111-1111-111111111111', ARRAY['curiosity','animals','night'], 'gentle',    '5-7'),
('bbbbbbbb-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-2222-2222-2222-222222222222', ARRAY['friendship','technology','nature'], 'cheerful', '6-9');
