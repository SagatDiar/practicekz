import { prisma } from "../../src/utils/db.js";
import { assertTestDatabase } from "../testEnv.js";

/** Полная очистка: все таблицы зависят от User (кроме Reference и реестров), CASCADE удалит связанные строки. */
export async function resetDb() {
  assertTestDatabase(process.env.DATABASE_URL ?? "");
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User", "Reference", "LegalEntity", "RegistryUniversity" RESTART IDENTITY CASCADE');
}
