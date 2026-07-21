// Supabase dual-URL setup (see .env.example):
// - DATABASE_URL (6543, pgbouncer) → app runtime in src/lib/db.ts
// - DIRECT_URL (5432, session pooler) → Prisma CLI migrations (required; 6543 hangs)
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"],
  },
});
