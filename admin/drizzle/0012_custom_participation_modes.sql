CREATE TABLE participation_modes (id TEXT PRIMARY KEY NOT NULL,event_id TEXT NOT NULL REFERENCES events(id),name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('direct','experiences')),enabled INTEGER NOT NULL DEFAULT 1,position INTEGER NOT NULL DEFAULT 0);
ALTER TABLE experiences ADD COLUMN mode_id TEXT REFERENCES participation_modes(id);
INSERT INTO participation_modes SELECT 'visit-'||id,id,'仅登岛参观','direct',visit_enabled,0 FROM events;
INSERT INTO participation_modes SELECT 'experience-'||id,id,'参与体验','experiences',experience_enabled,1 FROM events WHERE EXISTS(SELECT 1 FROM experiences x WHERE x.event_id=events.id AND x.name NOT IN ('','仅登岛参观')) OR EXISTS(SELECT 1 FROM slots s WHERE s.event_id=events.id AND s.experience NOT IN ('','仅登岛参观'));
UPDATE experiences SET mode_id=CASE WHEN name IN ('','仅登岛参观') THEN 'visit-'||event_id ELSE 'experience-'||event_id END;
INSERT INTO experiences(id,event_id,name,enabled,mode_id) SELECT 'visit-item-'||id,id,'',1,'visit-'||id FROM events WHERE NOT EXISTS(SELECT 1 FROM experiences WHERE event_id=events.id AND name='');
INSERT INTO experiences(id,event_id,name,enabled,mode_id) SELECT 'legacy-'||MIN(s.id),s.event_id,s.experience,1,CASE WHEN s.experience IN ('','仅登岛参观') THEN 'visit-'||s.event_id ELSE 'experience-'||s.event_id END FROM slots s WHERE NOT EXISTS(SELECT 1 FROM experiences x WHERE x.event_id=s.event_id AND x.name=s.experience) GROUP BY s.event_id,s.experience;
DROP TRIGGER booking_participation_insert;
DROP TRIGGER booking_participation_update;
CREATE TRIGGER booking_participation_insert BEFORE INSERT ON bookings WHEN NEW.status!='cancelled' BEGIN
 SELECT RAISE(ABORT,'BOOKING_CONFLICT') WHERE EXISTS (
 SELECT 1 FROM bookings b JOIN slots old ON old.id=b.slot_id JOIN slots chosen ON chosen.id=NEW.slot_id
 JOIN experiences ox ON ox.event_id=old.event_id AND ox.name=old.experience
 JOIN experiences cx ON cx.event_id=chosen.event_id AND cx.name=chosen.experience
 JOIN participation_modes cm ON cm.id=cx.mode_id
 WHERE b.user_id=NEW.user_id AND b.event_id=NEW.event_id AND b.id!=NEW.id AND b.status!='cancelled'
 AND (ox.mode_id!=cx.mode_id OR cm.kind='direct' OR ox.id=cx.id)
 );
END;
CREATE TRIGGER booking_participation_update BEFORE UPDATE OF slot_id,status ON bookings WHEN NEW.status!='cancelled' BEGIN
 SELECT RAISE(ABORT,'BOOKING_CONFLICT') WHERE EXISTS (
 SELECT 1 FROM bookings b JOIN slots old ON old.id=b.slot_id JOIN slots chosen ON chosen.id=NEW.slot_id
 JOIN experiences ox ON ox.event_id=old.event_id AND ox.name=old.experience
 JOIN experiences cx ON cx.event_id=chosen.event_id AND cx.name=chosen.experience
 JOIN participation_modes cm ON cm.id=cx.mode_id
 WHERE b.user_id=NEW.user_id AND b.event_id=NEW.event_id AND b.id!=NEW.id AND b.status!='cancelled'
 AND (ox.mode_id!=cx.mode_id OR cm.kind='direct' OR ox.id=cx.id)
 );
END;
