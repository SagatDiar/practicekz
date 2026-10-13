/**
 * Выдать вход представителю ВУЗа: карточка ВУЗа из реестра получает email и пароль и становится ACTIVE.
 *   npm run uni:account -- "<часть названия или сокращение>" email@вуз.kz [пароль]
 * Если пароль не указан — генерируется и печатается один раз. Студенты, уже выбравшие этот ВУЗ, остаются привязаны к нему.
 */
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "../src/utils/db.js";

const [query, emailRaw, passArg] = process.argv.slice(2);
if (!query || !emailRaw) { console.error('Использование: npm run uni:account -- "ЕНУ" rector@enu.kz [пароль]'); process.exit(1); }
const email = emailRaw.trim().toLowerCase();

const found = await prisma.universityProfile.findMany({
  where: { OR: [{ shortName: { equals: query, mode: "insensitive" } }, { universityName: { contains: query, mode: "insensitive" } }] },
  include: { user: true },
});
if (found.length !== 1) {
  console.error(found.length ? `Найдено ${found.length} ВУЗов, уточните запрос:\n` + found.map((f) => `  · ${f.shortName} — ${f.universityName} (${f.city})`).join("\n") : "ВУЗ не найден. Сначала: npm run import:universities");
  process.exit(1);
}
const u = found[0];
if (u.user.accountStatus !== "UNCLAIMED") { console.error("У этого ВУЗа уже есть аккаунт:", u.user.email); process.exit(1); }
if (await prisma.user.findUnique({ where: { email } })) { console.error("Такой email уже занят"); process.exit(1); }

const password = passArg ?? crypto.randomBytes(9).toString("base64url");
await prisma.user.update({ where: { id: u.userId }, data: { email, passwordHash: await bcrypt.hash(password, 10), accountStatus: "ACTIVE", emailVerifiedAt: new Date() } });
console.log(`Готово: ${u.universityName}\n  email:  ${email}\n  пароль: ${password}${passArg ? "" : "  (сохраните — повторно не покажется)"}`);
await prisma.$disconnect();
