CREATE TABLE comments (
	id           TEXT PRIMARY KEY,
	thread       TEXT NOT NULL,
	parent_id    TEXT,
	author       TEXT NOT NULL,
	author_email TEXT,
	author_url   TEXT,
	email_hash   TEXT,
	is_owner     INTEGER NOT NULL DEFAULT 0,
	body         TEXT NOT NULL,
	status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('approved', 'pending', 'rejected', 'spam')),
	source       TEXT NOT NULL DEFAULT 'web',
	created_at   INTEGER NOT NULL,
	ip_hash      TEXT
);
CREATE INDEX comments_status ON comments (status, created_at);
CREATE INDEX comments_thread ON comments (thread, created_at);
