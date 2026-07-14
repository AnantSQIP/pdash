-- Private joining details, collected on first sign-in.
--
-- A SEPARATE table, not columns on "user": GET /users is open to every authenticated member,
-- so anything on that table is one careless SELECT away from the whole company. Home
-- addresses and dates of birth must not sit on that path.

CREATE TABLE "user_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "bloodGroup" TEXT,
    "maritalStatus" TEXT,
    "nationality" TEXT,

    "personalEmail" TEXT,
    "alternatePhone" TEXT,

    "currentLine1" TEXT,
    "currentLine2" TEXT,
    "currentCity" TEXT,
    "currentState" TEXT,
    "currentPostalCode" TEXT,
    "currentCountry" TEXT,

    "permanentSameAsCurrent" BOOLEAN NOT NULL DEFAULT false,
    "permanentLine1" TEXT,
    "permanentLine2" TEXT,
    "permanentCity" TEXT,
    "permanentState" TEXT,
    "permanentPostalCode" TEXT,
    "permanentCountry" TEXT,

    "emergencyName" TEXT,
    "emergencyRelationship" TEXT,
    "emergencyPhone" TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_profile_userId_key" ON "user_profile"("userId");

ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Null until the person has filled their details in; AppShell blocks the app until then.
ALTER TABLE "user" ADD COLUMN "profileCompletedAt" TIMESTAMP(3);

-- Grandfather people who are ALREADY USING the system. They are mid-work; forcing the whole
-- team to fill a form the next time they open the app would be a hostile surprise and would
-- stall the ongoing testing.
--
-- Keyed on lastLoginAt, NOT on "every existing row": anyone invited but not yet signed in
-- (e.g. a brand-new joiner created minutes ago) has never seen the app, so they SHOULD meet
-- the gate on their first sign-in. That is exactly the flow this feature is for.
--
-- Existing staff can still fill their profile in from Settings at any time, and an admin can
-- require it of them by clearing this column.
UPDATE "user"
   SET "profileCompletedAt" = now()
 WHERE "deletedAt" IS NULL
   AND "lastLoginAt" IS NOT NULL;
