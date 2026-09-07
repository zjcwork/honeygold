import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  subtitle: text('subtitle').notNull(),
  description: text('description').notNull(),
  location: text('location').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  status: text('status').notNull().default('draft'),
  createdAt: text('created_at').notNull(),
});
export const slots = sqliteTable(
  'slots',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    experience: text('experience').notNull(),
    date: text('date').notNull(),
    time: text('time').notNull(),
    capacity: integer('capacity').notNull(),
  },
  (t) => [index('idx_slots_event').on(t.eventId)],
);
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  openid: text('openid').unique(),
  phone: text('phone'),
  name: text('name'),
  createdAt: text('created_at').notNull(),
});
export const sessions = sqliteTable('sessions', {
  hash: text('hash').primaryKey(),
  userId: text('user_id').notNull(),
  role: text('role').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
export const bookings = sqliteTable(
  'bookings',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    slotId: text('slot_id')
      .notNull()
      .references(() => slots.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    gender: text('gender').notNull(),
    status: text('status').notNull(),
    photoConsent: integer('photo_consent').notNull().default(0),
    termsVersion: text('terms_version').notNull(),
    code: text('code').notNull().unique(),
    createdAt: text('created_at').notNull(),
    checkedAt: text('checked_at'),
  },
  (t) => [
    uniqueIndex('idx_booking_active_user_event')
      .on(t.userId, t.eventId)
      .where(sql`${t.status} != 'cancelled'`),
    index('idx_booking_slot_status').on(t.slotId, t.status),
    index('idx_booking_created').on(t.createdAt),
  ],
);
export const notifications = sqliteTable('notifications', {
  bookingId: text('booking_id')
    .primaryKey()
    .references(() => bookings.id),
  status: text('status').notNull().default('pending'),
  lastError: text('last_error'),
  updatedAt: text('updated_at').notNull(),
});
