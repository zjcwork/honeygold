ALTER TABLE bookings ADD COLUMN booking_group_id TEXT;
DROP TRIGGER booking_participation_insert;
CREATE TRIGGER booking_participation_insert BEFORE INSERT ON bookings WHEN NEW.status!='cancelled' BEGIN
 SELECT RAISE(ABORT,'BOOKING_CONFLICT') WHERE EXISTS(
  SELECT 1 FROM bookings b WHERE b.user_id=NEW.user_id AND b.event_id=NEW.event_id AND b.status!='cancelled'
  AND (NEW.booking_group_id IS NULL OR b.booking_group_id IS NULL OR b.booking_group_id!=NEW.booking_group_id
   OR (SELECT mode_id FROM slots WHERE id=b.slot_id)!=(SELECT mode_id FROM slots WHERE id=NEW.slot_id)
   OR json_array_length(NEW.experience_ids)=0 OR json_array_length(b.experience_ids)=0
   OR EXISTS(SELECT 1 FROM json_each(b.experience_ids) old JOIN json_each(NEW.experience_ids) fresh ON old.value=fresh.value))
 );
END;
