/**
 * Загрузка реестра ВУЗов РК в базу.
 *   npm run import:universities                         — встроенный список data/universities-kz.json
 *   npm run import:universities -- путь/к/файлу.csv     — ваш файл (CSV / JSON / JSONL)
 * Столбцы CSV (любой порядок, русские/английские названия): Наименование, Город, Сокращение, БИН, Форма собственности, Сайт.
 * Повторный запуск обновляет записи, а не дублирует.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importUniversities } from "../src/registry/import.js";
import { prisma } from "../src/utils/db.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2];
const file = arg ?? path.join(dir, "../data/universities-kz.json");
const source = arg ? "IMPORT" : "CURATED";

const rep = await importUniversities(file, source);
console.log(`ВУЗы: прочитано ${rep.read}, сохранено ${rep.saved}, пропущено ${rep.skipped}`);
rep.errors.forEach((e) => console.log("  ·", e));
console.log(`Всего ВУЗов в реестре: ${await prisma.registryUniversity.count()}`);
await prisma.$disconnect();
