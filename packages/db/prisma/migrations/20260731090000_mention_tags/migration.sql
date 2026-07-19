-- 3b Named mention tags: org-level, admin-managed, @mentionable groups.
-- (mention_tag / mention_tag_member — distinct from the metadata `tag` label table.)
CREATE TABLE "mention_tag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mention_tag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mention_tag_organizationId_name_key" ON "mention_tag"("organizationId", "name");

CREATE TABLE "mention_tag_member" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "mention_tag_member_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mention_tag_member_tagId_userId_key" ON "mention_tag_member"("tagId", "userId");
CREATE INDEX "mention_tag_member_userId_idx" ON "mention_tag_member"("userId");

ALTER TABLE "mention_tag" ADD CONSTRAINT "mention_tag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mention_tag_member" ADD CONSTRAINT "mention_tag_member_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "mention_tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mention_tag_member" ADD CONSTRAINT "mention_tag_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
