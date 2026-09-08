ALTER TABLE events ADD COLUMN summary TEXT NOT NULL DEFAULT '';
UPDATE events SET summary=substr(description,1,300);
