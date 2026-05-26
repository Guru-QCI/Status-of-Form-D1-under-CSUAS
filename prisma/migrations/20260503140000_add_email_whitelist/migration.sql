-- CreateTable: EmailWhitelist
-- "Role" enum already exists from 20260503110221_init — no new type needed.
CREATE TABLE "EmailWhitelist" (
    "email"   TEXT         NOT NULL,
    "role"    "Role"       NOT NULL,
    "cbId"    TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailWhitelist_pkey" PRIMARY KEY ("email")
);

-- Index on cbId for FK lookups (cheap on a small table, good habit)
CREATE INDEX "EmailWhitelist_cbId_idx" ON "EmailWhitelist"("cbId");

-- AddForeignKey: cbId → CB.id (SET NULL on delete — whitelist row survives CB removal)
ALTER TABLE "EmailWhitelist"
    ADD CONSTRAINT "EmailWhitelist_cbId_fkey"
    FOREIGN KEY ("cbId") REFERENCES "CB"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
