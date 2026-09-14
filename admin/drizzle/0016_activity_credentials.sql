CREATE TABLE booking_credentials(group_key TEXT PRIMARY KEY NOT NULL,code TEXT NOT NULL UNIQUE);
INSERT INTO booking_credentials(group_key,code)
SELECT COALESCE(b.booking_group_id,b.id),b.code FROM bookings b
WHERE b.id=(SELECT x.id FROM bookings x WHERE COALESCE(x.booking_group_id,x.id)=COALESCE(b.booking_group_id,b.id) ORDER BY x.created_at,x.id LIMIT 1);
CREATE TRIGGER booking_activity_credential AFTER INSERT ON bookings BEGIN
 INSERT OR IGNORE INTO booking_credentials(group_key,code) VALUES(COALESCE(NEW.booking_group_id,NEW.id),NEW.code);
END;
