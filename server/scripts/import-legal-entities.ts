/**
 * Загрузка реестра юридических лиц (БИН) в базу.
 *   npm run import:entities -- путь/к/файлу.csv [ИСТОЧНИК]
 * Файл: CSV (разделитель ; , или Tab), JSON или JSONL. Нужны столбцы «БИН» и «Наименование»; остальные необязательны:
 * Организационно-правовая форма, ОКЭД, Сфера деятельности, Город, Область, Адрес, Руководитель, Дата регистрации, Статус.
 * Строки с неверным БИН (не проходит контрольная сумма) пропускаются и попадают в отчёт.
 * Подходит для файлов в миллионы строк: читается потоком, пишется пачками по 2000.
 */
import { importLegalEntities } from "../src/registry/import.js";
import { prisma } from "../src/utils/db.js";

const file = process.argv[2];
if (!file) { console.error("Укажите файл: npm run import:entities -- реестр.csv"); process.exit(1); }
const source = process.argv[3] ?? "IMPORT";

const t0 = Date.now();
const rep = await importLegalEntities(file, source, (n) => process.stdout.write(`\r  прочитано строк: ${n}`));
console.log(`\nЮрлица: прочитано ${rep.read}, сохранено ${rep.saved}, пропущено ${rep.skipped} (${((Date.now() - t0) / 1000).toFixed(1)} с)`);
rep.errors.forEach((e) => console.log("  ·", e));
console.log(`Всего юрлиц в базе: ${await prisma.legalEntity.count()}`);
await prisma.$disconnect();
