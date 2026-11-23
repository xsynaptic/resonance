-- Migration number: 0002 	 2026-11-23T00:00:00.000Z
-- Renaming the old table first lets the CREATE TABLE match packages/astro-comments/schema.sql; no trigger, view or foreign key refers to it
ALTER TABLE comments RENAME TO comments_previous;
DROP INDEX comments_status;
DROP INDEX comments_entry;
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
INSERT INTO comments (id, thread, parent_id, author, author_email, author_url, email_hash, body, status, source, created_at, ip_hash)
SELECT id, collection || '/' || entry_id, parent_id, author, author_email, author_url, gravatar_hash, body, status, source, created_at, ip_hash
FROM comments_previous;
DROP TABLE comments_previous;
-- Basilisk's comments: `user_id` 1, the post author, in the WordPress dump of 2026-06-28
UPDATE comments SET is_owner = 1 WHERE id IN (
	'wp-134', 'wp-141', 'wp-244', 'wp-246', 'wp-255', 'wp-261', 'wp-329', 'wp-456',
	'wp-466', 'wp-544', 'wp-690', 'wp-704', 'wp-886', 'wp-893', 'wp-894', 'wp-906',
	'wp-943', 'wp-946', 'wp-956', 'wp-961', 'wp-974', 'wp-977', 'wp-1006', 'wp-1017',
	'wp-1025', 'wp-1026', 'wp-1032', 'wp-1038', 'wp-1049', 'wp-1073', 'wp-1081', 'wp-1108',
	'wp-1122', 'wp-1143', 'wp-1145', 'wp-1158', 'wp-1161', 'wp-1166', 'wp-1186', 'wp-1192',
	'wp-1195', 'wp-1300', 'wp-1316', 'wp-1409', 'wp-2603', 'wp-5959'
);
