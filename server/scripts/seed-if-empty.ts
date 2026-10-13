// Запускает seed только если база пустая (чтобы не стирать данные при каждом перезапуске)
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";

const db = new PrismaClient();
const n = await db.user.count();
await db.$disconnect();
if (n === 0) {
  console.log("База пустая — загружаю демо-данные и реестр ВУЗов...");
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
} else {
  console.log(`В базе уже ${n} пользователей — seed пропущен.`);
}
