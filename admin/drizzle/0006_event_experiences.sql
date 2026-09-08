CREATE TABLE event_experiences (id TEXT PRIMARY KEY NOT NULL,event_id TEXT NOT NULL REFERENCES events(id),name TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,UNIQUE(event_id,name));
INSERT INTO event_experiences SELECT lower(hex(randomblob(16))),e.id,x.name,x.enabled FROM events e CROSS JOIN experiences x;
INSERT OR IGNORE INTO event_experiences SELECT lower(hex(randomblob(16))),event_id,experience,1 FROM slots GROUP BY event_id,experience;
DROP TABLE experiences;
ALTER TABLE event_experiences RENAME TO experiences;
