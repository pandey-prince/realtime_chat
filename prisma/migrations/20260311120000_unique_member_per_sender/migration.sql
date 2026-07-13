-- Remove duplicate memberships for the same username in a room (keep oldest).
DELETE FROM "PersistentMember"
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY "roomId", sender
        ORDER BY "joinedAt" ASC
      ) AS rn
    FROM "PersistentMember"
  ) ranked
  WHERE rn > 1
);

-- One membership row per (room, anonymous username).
CREATE UNIQUE INDEX "PersistentMember_roomId_sender_key" ON "PersistentMember"("roomId", sender);
