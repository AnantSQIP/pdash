-- Wedding anniversary on the user profile (set when MARRIED) — powers the celebrations feed
-- (month/day only). Strictly additive: one nullable column. Applies via prisma migrate deploy.
ALTER TABLE "user_profile" ADD COLUMN "weddingAnniversary" TIMESTAMP(3);
