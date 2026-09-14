ALTER TABLE events ADD COLUMN visit_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE events ADD COLUMN experience_enabled INTEGER NOT NULL DEFAULT 1;
DROP INDEX idx_booking_active_user_event;
CREATE TRIGGER booking_participation_insert BEFORE INSERT ON bookings
WHEN NEW.status != 'cancelled'
BEGIN
 SELECT RAISE(ABORT,'BOOKING_CONFLICT') WHERE EXISTS (
 SELECT 1 FROM bookings b JOIN slots old ON old.id=b.slot_id JOIN slots chosen ON chosen.id=NEW.slot_id
 WHERE b.user_id=NEW.user_id AND b.event_id=NEW.event_id AND b.id!=NEW.id AND b.status!='cancelled'
 AND (old.experience=chosen.experience OR old.experience IN ('','仅登岛参观') OR chosen.experience IN ('','仅登岛参观'))
 );
END;
CREATE TRIGGER booking_participation_update BEFORE UPDATE OF slot_id,status ON bookings
WHEN NEW.status != 'cancelled'
BEGIN
 SELECT RAISE(ABORT,'BOOKING_CONFLICT') WHERE EXISTS (
 SELECT 1 FROM bookings b JOIN slots old ON old.id=b.slot_id JOIN slots chosen ON chosen.id=NEW.slot_id
 WHERE b.user_id=NEW.user_id AND b.event_id=NEW.event_id AND b.id!=NEW.id AND b.status!='cancelled'
 AND (old.experience=chosen.experience OR old.experience IN ('','仅登岛参观') OR chosen.experience IN ('','仅登岛参观'))
 );
END;
