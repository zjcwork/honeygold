CREATE TABLE admin_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
INSERT INTO admin_users VALUES ('admin', 'admin', '2b969c4fa694417d0e738dbecbc85e0f87b593fa7a019f27e43175137d532dd5', 'b283cb71c48da3d2e7700c2746f2ef73', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
DELETE FROM sessions WHERE role='admin';
