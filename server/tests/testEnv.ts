/** Тесты ходят в отдельную базу (имя обязано содержать «test»): она очищается перед каждым тестом. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://practice:practice@localhost:5432/practicekz_test";

export function assertTestDatabase(url: string) {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(name)) {
    throw new Error(`Отказ: база «${name}» не похожа на тестовую (в имени нет «test»). Тесты стирают все данные.`);
  }
}
