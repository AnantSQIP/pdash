-- PID lifecycle: reservation records for the 5-minute allocation window, one-un-attached-per-user,
-- serial reclaim vs. discontinuation, and discontinue-on-close. Strictly ADDITIVE: one new table.
-- Existing project codes remain the source of truth for already-attached PIDs; the allocator unions
-- them with these rows so no serial is ever reused. Applies via `prisma migrate deploy` on boot.
CREATE TABLE "pid_reservation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fyLabel" TEXT NOT NULL,
    "serial" INTEGER NOT NULL,
    "pid" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "pid_reservation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pid_reservation_organizationId_pid_key" ON "pid_reservation"("organizationId", "pid");
CREATE INDEX "pid_reservation_organizationId_fyLabel_status_idx" ON "pid_reservation"("organizationId", "fyLabel", "status");
CREATE INDEX "pid_reservation_generatedById_status_idx" ON "pid_reservation"("generatedById", "status");
CREATE INDEX "pid_reservation_projectId_idx" ON "pid_reservation"("projectId");
