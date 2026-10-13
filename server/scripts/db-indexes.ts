/**
 * Индексы для быстрого поиска по названию в миллионах юрлиц (подстрока, регистр не важен).
 * Prisma не умеет GIN/trigram, поэтому создаём вручную. Запускать после `prisma db push`; безопасно повторять.
 * Если у пользователя БД нет прав на CREATE EXTENSION — просто пропускается, поиск работает, но медленнее.
 */
import { prisma } from "../src/utils/db.js";

try {
  await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "LegalEntity_name_trgm" ON "LegalEntity" USING gin (name gin_trgm_ops)');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "RegistryUniversity_name_trgm" ON "RegistryUniversity" USING gin (name gin_trgm_ops)');
  console.log("Индексы pg_trgm созданы");
} catch (e) {
  console.warn("Не удалось создать индексы pg_trgm (поиск будет работать медленнее):", (e as Error).message);
}
await prisma.$disconnect();
