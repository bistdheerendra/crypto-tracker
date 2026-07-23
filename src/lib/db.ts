/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */

const globalForPrisma = globalThis as unknown as { prisma?: any };

const CLIENT_PATH = "../generated/prisma/client";

/** True when a real Postgres URL is configured (not the Prisma placeholder). */
export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return false;
  if (url.includes("johndoe:randompassword")) return false;
  if (url.includes("localhost:5432/mydb")) return false;
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

function createPrismaClient(): any {
  const { PrismaClient } = require(CLIENT_PATH);
  const { PrismaPg } = require("@prisma/adapter-pg");
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 300_000,
  });
  return new PrismaClient({ adapter });
}

function hasExpectedDelegates(client: any): boolean {
  // After `prisma generate` adds models, Next.js HMR can leave a stale singleton.
  return (
    typeof client?.verdict?.findMany === "function" &&
    typeof client?.position?.findMany === "function"
  );
}

function bustPrismaRequireCache(): void {
  try {
    const resolved = require.resolve(CLIENT_PATH);
    delete require.cache[resolved];
    // Also clear sibling modules under generated/prisma that the client imports.
    for (const key of Object.keys(require.cache)) {
      if (key.replace(/\\/g, "/").includes("/generated/prisma/")) {
        delete require.cache[key];
      }
    }
  } catch {
    // ignore — resolve can fail if never loaded
  }
}

/**
 * Lazy-load Prisma only when DATABASE_URL is real.
 * Avoids pulling the generated client into the memory-fallback / request path.
 * Recreates the client if HMR left a stale instance missing newer models.
 */
export function getPrisma(): any | null {
  if (!isDatabaseConfigured()) return null;

  if (globalForPrisma.prisma && !hasExpectedDelegates(globalForPrisma.prisma)) {
    try {
      void globalForPrisma.prisma.$disconnect();
    } catch {
      // ignore
    }
    globalForPrisma.prisma = undefined;
    bustPrismaRequireCache();
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }

  return globalForPrisma.prisma ?? null;
}
