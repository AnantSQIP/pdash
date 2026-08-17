-- The published 2026 holiday calendar, and optional holidays that are not firm-wide days off.
--
-- WHY OPTIONAL HOLIDAYS GET THEIR OWN TABLE
--
-- Twelve queries across attendance, capacity, leave, timesheets, performance and the daily digest
-- read `holiday` and treat every row as a day the firm is shut. Not one of them filters on `type`.
-- So an OPTIONAL holiday sitting in that table is a day off for the entire company — which is
-- exactly what had happened: Good Friday was seeded `type='OPTIONAL'` and every working-day
-- calculation in the system was already giving it to everybody.
--
-- The published rule is the opposite: four optional holidays are declared, each employee may take
-- TWO, applied for in advance and approved subject to team requirements. That is a per-person fact,
-- not a firm-wide one. Separating the tables means no existing calculation had to change, and none
-- of them can hand the whole firm a day off by accident.

CREATE TABLE IF NOT EXISTS "optional_holiday" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "date"           TIMESTAMP(3) NOT NULL,
  "year"           INTEGER NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "optional_holiday_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "optional_holiday_organizationId_date_key" ON "optional_holiday"("organizationId", "date");
CREATE INDEX IF NOT EXISTS "optional_holiday_organizationId_year_idx" ON "optional_holiday"("organizationId", "year");
ALTER TABLE "optional_holiday" DROP CONSTRAINT IF EXISTS "optional_holiday_organizationId_fkey";
ALTER TABLE "optional_holiday" ADD CONSTRAINT "optional_holiday_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "optional_holiday_election" (
  "id"                TEXT NOT NULL,
  "optionalHolidayId" TEXT NOT NULL,
  "userId"            TEXT NOT NULL,
  "status"            TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedBy"        TEXT,
  "reviewedAt"        TIMESTAMP(3),
  "reviewNote"        TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "optional_holiday_election_pkey" PRIMARY KEY ("id")
);
-- One request per person per holiday: asking twice is a mistake, not a second day off.
CREATE UNIQUE INDEX IF NOT EXISTS "optional_holiday_election_optionalHolidayId_userId_key"
  ON "optional_holiday_election"("optionalHolidayId", "userId");
CREATE INDEX IF NOT EXISTS "optional_holiday_election_userId_status_idx"
  ON "optional_holiday_election"("userId", "status");
ALTER TABLE "optional_holiday_election" DROP CONSTRAINT IF EXISTS "optional_holiday_election_optionalHolidayId_fkey";
ALTER TABLE "optional_holiday_election" ADD CONSTRAINT "optional_holiday_election_optionalHolidayId_fkey"
  FOREIGN KEY ("optionalHolidayId") REFERENCES "optional_holiday"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "optional_holiday_election" DROP CONSTRAINT IF EXISTS "optional_holiday_election_userId_fkey";
ALTER TABLE "optional_holiday_election" ADD CONSTRAINT "optional_holiday_election_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── The 2026 calendar as published ───────────────────────────────────────────
-- Applied per organisation so a fresh org gets it too. Idempotent: `holiday` is unique on
-- (organizationId, date), so re-running updates the name/type rather than duplicating.
--
-- Three of the nineteen fall on a weekend (Maha Shivaratri, Independence Day, Deepavali). They are
-- recorded as type WEEKEND so the in-app calendar matches the sheet HR circulated, and they grant
-- nothing, because a Sunday was never a working day.
INSERT INTO "holiday" ("id", "organizationId", "name", "date", "type", "recurring", "createdAt")
SELECT
  md5(o.id || h.d) , o.id, h.n, h.d::timestamp, h.t, false, CURRENT_TIMESTAMP
FROM "organization" o
CROSS JOIN (VALUES
  ('2026-01-01', 'New Year''s Day',        'PUBLIC'),
  ('2026-01-14', 'Makar Sankranti',        'PUBLIC'),
  ('2026-01-26', 'Republic Day',           'PUBLIC'),
  ('2026-02-15', 'Maha Shivaratri',        'WEEKEND'),
  ('2026-03-04', 'Holi',                   'PUBLIC'),
  ('2026-04-15', 'Vaisakhi',               'PUBLIC'),
  ('2026-08-15', 'Independence Day',       'WEEKEND'),
  ('2026-08-28', 'Raksha Bandhan',         'PUBLIC'),
  ('2026-09-14', 'Ganesh Chaturthi',       'PUBLIC'),
  ('2026-10-02', 'Gandhi Jayanti',         'PUBLIC'),
  ('2026-10-20', 'Vijaya Dashami',         'PUBLIC'),
  ('2026-11-08', 'Deepavali',              'WEEKEND'),
  ('2026-11-09', 'Govardhan Puja',         'PUBLIC'),
  ('2026-11-24', 'Guru Nanak Jayanti',     'PUBLIC'),
  ('2026-12-25', 'Christmas Day',          'PUBLIC')
) AS h(d, n, t)
ON CONFLICT ("organizationId", "date") DO UPDATE
  SET "name" = EXCLUDED."name", "type" = EXCLUDED."type";

-- The four optional holidays, into their own table.
INSERT INTO "optional_holiday" ("id", "organizationId", "name", "date", "year", "createdAt")
SELECT md5('opt' || o.id || h.d), o.id, h.n, h.d::timestamp, 2026, CURRENT_TIMESTAMP
FROM "organization" o
CROSS JOIN (VALUES
  ('2026-01-05', 'Guru Gobind Singh Jayanti'),
  ('2026-03-20', 'Eid-ul-Fitr'),
  ('2026-04-03', 'Good Friday'),
  ('2026-09-04', 'Krishna Janmashtami')
) AS h(d, n)
ON CONFLICT ("organizationId", "date") DO UPDATE SET "name" = EXCLUDED."name";

-- Good Friday was seeded into `holiday` as OPTIONAL and has therefore been a firm-wide day off.
-- It now lives in optional_holiday, so remove the firm-wide row. Any other legacy OPTIONAL row
-- goes the same way: that type no longer means anything in this table.
DELETE FROM "holiday" WHERE "type" = 'OPTIONAL';

-- The seeded "Firm Foundation Day" was demo data, not on the published calendar. Left alone
-- deliberately — if the firm does observe it, deleting it here would quietly remove a real day off.
