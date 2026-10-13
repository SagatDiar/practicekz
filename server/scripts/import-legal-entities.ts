// server/scripts/import-legal-entities.ts
// Іске қосу (Render Shell): npx tsx scripts/import-legal-entities.ts
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const file = path.join(__dirname, "companies.clean.json");

async function main() {
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  let created = 0, updated = 0;
  for (const r of rows) {
    // ВНИМАНИЕ: модель `company` и поля ниже — предположение, подправьте под schema.prisma
    const data = {
      name: r.nameRu,
      nameKz: r.nameKz || null,
      bin: r.bin,
      director: r.director || null,
      address: r.addressRu || r.addressKz || null,
      activity: r.activityRu || null,
      registeredAt: new Date(r.registeredAt),
    };
    const existing = await prisma.company.findUnique({ where: { bin: r.bin } });
    if (existing) { await prisma.company.update({ where: { bin: r.bin }, data }); updated++; }
    else { await prisma.company.create({ data }); created++; }
  }
  console.log(`Дайын: жаңа ${created}, жаңартылған ${updated}`);
}
main().finally(() => prisma.$disconnect());
