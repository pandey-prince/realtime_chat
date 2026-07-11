-- CreateTable
CREATE TABLE "PersistentRoom" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PersistentRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersistentMember" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersistentMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersistentMessage" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "text" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersistentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersistentRoom_code_key" ON "PersistentRoom"("code");

-- CreateIndex
CREATE INDEX "PersistentRoom_deletedAt_idx" ON "PersistentRoom"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PersistentMember_token_key" ON "PersistentMember"("token");

-- CreateIndex
CREATE INDEX "PersistentMember_roomId_idx" ON "PersistentMember"("roomId");

-- CreateIndex
CREATE INDEX "PersistentMessage_roomId_createdAt_idx" ON "PersistentMessage"("roomId", "createdAt");

-- AddForeignKey
ALTER TABLE "PersistentMember" ADD CONSTRAINT "PersistentMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "PersistentRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersistentMessage" ADD CONSTRAINT "PersistentMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "PersistentRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
