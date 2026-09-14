ALTER TABLE slots ADD COLUMN mode_id TEXT REFERENCES participation_modes(id);
ALTER TABLE bookings ADD COLUMN experience_ids TEXT NOT NULL DEFAULT '[]';
UPDATE slots SET mode_id=(SELECT mode_id FROM experiences WHERE event_id=slots.event_id AND name=slots.experience);
UPDATE bookings SET experience_ids=COALESCE((SELECT json_array(x.id) FROM slots s JOIN experiences x ON x.event_id=s.event_id AND x.name=s.experience JOIN participation_modes m ON m.id=x.mode_id WHERE s.id=bookings.slot_id AND m.kind='experiences'),'[]');
DROP TRIGGER booking_participation_insert;
DROP TRIGGER booking_participation_update;
CREATE TABLE _slot_merge AS SELECT id,(SELECT MIN(t.id) FROM slots t WHERE t.mode_id=s.mode_id AND t.date=s.date AND t.time=s.time) canonical FROM slots s;
UPDATE bookings SET slot_id=(SELECT canonical FROM _slot_merge WHERE id=bookings.slot_id);
UPDATE slots SET capacity=MAX((SELECT MAX(t.capacity) FROM slots t WHERE t.mode_id=slots.mode_id AND t.date=slots.date AND t.time=slots.time),(SELECT COUNT(DISTINCT user_id) FROM bookings WHERE slot_id=slots.id AND status IN ('confirmed','checked'))) WHERE id IN (SELECT canonical FROM _slot_merge);
DELETE FROM slots WHERE id IN (SELECT id FROM _slot_merge WHERE id!=canonical);
DROP TABLE _slot_merge;
CREATE UNIQUE INDEX slots_mode_datetime ON slots(mode_id,date,time);
CREATE TRIGGER booking_participation_insert BEFORE INSERT ON bookings WHEN NEW.status!='cancelled' BEGIN
 SELECT RAISE(ABORT,'BOOKING_CONFLICT') WHERE EXISTS(SELECT 1 FROM bookings WHERE user_id=NEW.user_id AND event_id=NEW.event_id AND status!='cancelled');
END;
