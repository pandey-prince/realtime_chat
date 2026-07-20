import { execSync } from "node:child_process";

function run(command, env = process.env) {
  console.log(`> ${command}`);
  execSync(command, { stdio: "inherit", env });
}

const migrateUrl =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;

if (migrateUrl) {
  run("prisma migrate deploy", {
    ...process.env,
    DATABASE_URL: migrateUrl,
  });
} else {
  console.warn(
    "No database URL found — skipping prisma migrate deploy (local build without DB).",
  );
}

run("prisma generate");
run("next build");
