-- The Attendance.status column defaulted to 'PRESENT', so any row created without an explicit
-- status silently asserted that the person showed up. Attendance must never be assumed —
-- default to ABSENT and let a punch / regularisation / HR mark set it.
ALTER TABLE "attendance" ALTER COLUMN "status" SET DEFAULT 'ABSENT';
