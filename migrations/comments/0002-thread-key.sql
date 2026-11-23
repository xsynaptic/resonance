-- Migration number: 0002 	 2026-11-23T00:00:00.000Z
CREATE TABLE comments_next (
	id            TEXT PRIMARY KEY,
	thread        TEXT NOT NULL,
	parent_id     TEXT,
	author        TEXT NOT NULL,
	author_email  TEXT,
	author_url    TEXT,
	gravatar_hash TEXT,
	body          TEXT NOT NULL,
	status        TEXT NOT NULL DEFAULT 'pending',
	source        TEXT NOT NULL DEFAULT 'web',
	created_at    INTEGER NOT NULL,
	ip_hash       TEXT
);
INSERT INTO comments_next (id, thread, parent_id, author, author_email, author_url, gravatar_hash, body, status, source, created_at, ip_hash)
SELECT id, collection || '/' || entry_id, parent_id, author, author_email, author_url, gravatar_hash, body, status, source, created_at, ip_hash
FROM comments;
DROP TABLE comments;
ALTER TABLE comments_next RENAME TO comments;
CREATE INDEX comments_status ON comments (status, created_at);
CREATE INDEX comments_thread ON comments (thread, created_at);
