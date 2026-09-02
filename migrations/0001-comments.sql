-- Migration number: 0001 	 2026-09-02T00:00:00.000Z
CREATE TABLE comments (
	id            TEXT PRIMARY KEY,
	collection    TEXT NOT NULL,
	entry_id      TEXT NOT NULL,
	parent_id     TEXT,
	author        TEXT NOT NULL,
	author_email  TEXT,
	author_url    TEXT,
	gravatar_hash TEXT,
	body          TEXT NOT NULL,
	status        TEXT NOT NULL DEFAULT 'pending',
	source        TEXT NOT NULL DEFAULT 'web',
	created_at    INTEGER NOT NULL,
	ip_hash       TEXT,
	wp_post_id    INTEGER
);
CREATE INDEX comments_status ON comments (status, created_at);
CREATE INDEX comments_entry  ON comments (collection, entry_id, created_at);
