-- Client name is now optional (only the code is mandatory).
ALTER TABLE "client" ALTER COLUMN "name" DROP NOT NULL;
