import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TEST_DATABASE_URL, assertTestDatabase } from "./testEnv.js";

/** Один раз перед всеми тестами: создаёт тестовую базу (если нет) и приводит схему к schema.prisma. */
export default function setup() {
  assertTestDatabase(TEST_DATABASE_URL);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: root,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}
