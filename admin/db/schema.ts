import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const events = sqliteTable('events', {
  visitEnabled:integer('visit_enabled').notNull().default(1),
  experienceEnabled:integer('experience_enabled').notNull().default(1),
  contactWechat:text('contact_wechat').notNull().default(''),
  contactQr:text('contact_qr').notNull().default(''),
  notices: text('notices').notNull().default(''),
  detailContent:text('detail_content').notNull().default(''),
  summary: text('summary').notNull().default(''),
  coverImage: text('cover_image').notNull().default(''),
  heroImage: text('hero_image').notNull().default(''),
  detailImages: text('detail_images').notNull().default(''),
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
    modeId:text('mode_id').references(()=>participationModes.id),
    experienceId:text('experience_id').references(()=>experiences.id),
    experience: text('experience').notNull(),
    date: text('date').notNull(),
    time: text('time').notNull(),
    capacity: integer('capacity').notNull(),
  },
  (t) => [index('idx_slots_event').on(t.eventId),uniqueIndex('slots_mode_experience_datetime').on(t.modeId,sql`COALESCE(${t.experienceId}, '')`,t.date,t.time)],
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
    birthday:text('birthday').notNull().default(''),
    status: text('status').notNull(),
    experienceIds:text('experience_ids').notNull().default('[]'),
    bookingGroupId:text('booking_group_id'),
    superseded:integer('superseded').notNull().default(0),
    photoConsent: integer('photo_consent').notNull().default(0),
    termsVersion: text('terms_version').notNull(),
    code: text('code').notNull().unique(),
    createdAt: text('created_at').notNull(),
    checkedAt: text('checked_at'),
  },
  (t) => [
    // Participation uniqueness and visit/experience exclusion are enforced by migration triggers.
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

export const contentSettings = sqliteTable('content_settings', { id: text('id').primaryKey(), payload: text('payload').notNull() });

export const participationModes=sqliteTable('participation_modes',{id:text('id').primaryKey(),eventId:text('event_id').notNull().references(()=>events.id),name:text('name').notNull(),kind:text('kind').notNull(),enabled:integer('enabled').notNull().default(1),position:integer('position').notNull().default(0)});
export const experiences = sqliteTable('experiences', {modeId:text('mode_id').references(()=>participationModes.id),id:text('id').primaryKey(),eventId:text('event_id').notNull().references(()=>events.id),name:text('name').notNull(),enabled:integer('enabled').notNull().default(1)}, t=>[uniqueIndex('experiences_event_name').on(t.eventId,t.name)]);
export const bookingCredentials=sqliteTable('booking_credentials',{groupKey:text('group_key').primaryKey(),code:text('code').notNull().unique()});
