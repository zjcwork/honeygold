CREATE TABLE experiences (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL UNIQUE, enabled INTEGER NOT NULL DEFAULT 1);
INSERT INTO experiences VALUES('beauty','鎏金美甲 Beauty Bar',1),('gold','微醺特调 Gold Bar',1),('visit','仅登岛参观',1);
INSERT OR IGNORE INTO experiences SELECT 'legacy-'||lower(hex(randomblob(16))),experience,1 FROM slots GROUP BY experience;
