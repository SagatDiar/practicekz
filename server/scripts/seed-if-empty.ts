// Запускает seed, если база пустая или в ней старый список ВУЗов (не из официального перечня egov.kz).
// Обычные перезапуски данные не трогают.
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";

const db = new PrismaClient();
const users = await db.user.count();
const hasOfficialList = (await db.registryUniversity.count({ where: { name: { contains: "Alikhan Bokeikhan" } } })) > 0;
await db.$disconnect();
if (users === 0 || !hasOfficialList) {
  console.log("Загружаю демо-данные и официальный реестр ВУЗов (egov.kz)...");
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
} else {
  console.log(`В базе уже ${users} пользователей и актуальный реестр ВУЗов — seed пропущен.`);
}
