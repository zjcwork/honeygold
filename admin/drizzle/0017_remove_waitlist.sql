UPDATE bookings SET status='cancelled' WHERE status='waitlisted';
CREATE TRIGGER booking_capacity_insert BEFORE INSERT ON bookings BEGIN
 SELECT RAISE(ABORT,'SLOT_FULL') WHERE NEW.status='waitlisted' OR (NEW.status IN ('confirmed','checked') AND NOT EXISTS(SELECT 1 FROM bookings WHERE slot_id=NEW.slot_id AND user_id=NEW.user_id AND status IN ('confirmed','checked')) AND (SELECT COUNT(DISTINCT user_id) FROM bookings WHERE slot_id=NEW.slot_id AND status IN ('confirmed','checked'))>=(SELECT capacity FROM slots WHERE id=NEW.slot_id));
END;
CREATE TRIGGER booking_no_waitlist_update BEFORE UPDATE OF status ON bookings WHEN NEW.status='waitlisted' BEGIN
 SELECT RAISE(ABORT,'SLOT_FULL');
END;
