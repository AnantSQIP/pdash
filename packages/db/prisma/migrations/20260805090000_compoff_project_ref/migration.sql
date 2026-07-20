-- Comp-off claims carry a free-text Project ID (PID). Nullable so existing rows are valid.
ALTER TABLE "comp_off_request" ADD COLUMN "projectRef" TEXT;
