-- Patent-analysis clients, confidential coded patents, project↔patent links,
-- the atomic serial allocator, and the PID column on project. Strictly ADDITIVE:
-- new tables + a nullable column + a unique index on the (all-NULL) project.code.

-- Client (the "Malikie / MLK" grouping)
CREATE TABLE "client" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "client_organizationId_code_key" ON "client"("organizationId", "code");
CREATE INDEX "client_organizationId_deletedAt_idx" ON "client"("organizationId", "deletedAt");

-- Patent (confidential real number + public handle)
CREATE TABLE "patent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serial" INTEGER NOT NULL,
    "handle" TEXT NOT NULL,
    "realNumber" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "patent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "patent_organizationId_handle_key" ON "patent"("organizationId", "handle");
CREATE UNIQUE INDEX "patent_clientId_serial_key" ON "patent"("clientId", "serial");
CREATE INDEX "patent_organizationId_clientId_deletedAt_idx" ON "patent"("organizationId", "clientId", "deletedAt");
ALTER TABLE "patent" ADD CONSTRAINT "patent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Project ↔ Patent (many-to-many)
CREATE TABLE "project_patent" (
    "projectId" TEXT NOT NULL,
    "patentId" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_patent_pkey" PRIMARY KEY ("projectId", "patentId")
);
CREATE INDEX "project_patent_patentId_idx" ON "project_patent"("patentId");
ALTER TABLE "project_patent" ADD CONSTRAINT "project_patent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_patent" ADD CONSTRAINT "project_patent_patentId_fkey" FOREIGN KEY ("patentId") REFERENCES "patent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Atomic serial allocator
CREATE TABLE "sequence_counter" (
    "scope" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "sequence_counter_pkey" PRIMARY KEY ("scope")
);

-- Project: add clientId + the PID unique index on the existing (all-NULL) code column
ALTER TABLE "project" ADD COLUMN "clientId" TEXT;
CREATE UNIQUE INDEX "project_code_key" ON "project"("code");
CREATE INDEX "project_clientId_idx" ON "project"("clientId");
ALTER TABLE "project" ADD CONSTRAINT "project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
