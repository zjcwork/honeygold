ALTER TABLE slots ADD COLUMN experience_id TEXT REFERENCES experiences(id);
DROP INDEX slots_mode_datetime;
CREATE UNIQUE INDEX slots_mode_experience_datetime ON slots(mode_id,COALESCE(experience_id,''),date,time);
