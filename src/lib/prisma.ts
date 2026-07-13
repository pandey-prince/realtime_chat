import { PrismaClient } from "@prisma/client";

function isCachedPlanError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    String((error as { message: unknown }).message).includes(
      "cached plan must not change result type",
    )
  );
}

function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          try {
            return await query(args);
          } catch (error) {
            // Neon/PgBouncer may keep prepared statements after DDL (e.g. VarChar→Text).
            if (!isCachedPlanError(error)) throw error;
            await client.$disconnect();
            return await query(args);
          }
        },
      },
    },
  });
}

type AppPrisma = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma?: AppPrisma };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
