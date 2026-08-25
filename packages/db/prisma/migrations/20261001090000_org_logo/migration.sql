-- The Settings page has shown a Logo upload box since Phase 1 with nothing behind it — clicking it
-- raised "Upload coming soon". There was nowhere to put a logo, so this adds the column.
--
-- Stored the same way as User.profilePhoto: an image data URL in the row. That is the wrong answer
-- for large media and the right one here — a logo is a few tens of kilobytes, it is read on every
-- page load with the org record anyway, and it avoids standing up file storage for one image.
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "logo" TEXT;
