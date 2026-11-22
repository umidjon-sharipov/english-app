import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  __englishStudioPrisma?: PrismaClient;
};

function createPrismaClient() {
  return new PrismaClient({
    log: ["error"],
  });
}

export const prisma: PrismaClient =
  globalForPrisma.__englishStudioPrisma ??
  globalForPrisma.prisma ??
  createPrismaClient();

globalForPrisma.__englishStudioPrisma = prisma;
globalForPrisma.prisma = prisma;

export const db = prisma;
