import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/utils/db.js";
import { outbox } from "../src/utils/mailer.js";
import { PASSWORD, createCompany, createEntity, createStudent, createUniversity } from "./helpers/factories.js";
import { api, loginAs } from "./helpers/http.js";

const studentBody = (universityId: string, over: Record<string, unknown> = {}) => ({
  role: "STUDENT", firstName: "Алия", lastName: "Сериккызы", specialty: "Информационные системы", course: 3,
  faculty: "Информационных технологий", city: "Астана", skills: "SQL, React", universityId,
  email: "aliya@test.kz", password: "secret123", ...over,
});
const companyBody = (bin: string, over: Record<string, unknown> = {}) => ({
  role: "COMPANY", bin, city: "Алматы", email: "newco@test.kz", password: "secret123", ...over,
});
const cookies = (res: request.Response) => (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
const hasAuthCookie = (res: request.Response) => cookies(res).some((c) => c.startsWith("access_token="));

describe("регистрация студента", () => {
  it("201: аккаунт ждёт подтверждения email, вход не выдан, пароль хэшируется bcrypt", async () => {
    const uni = await createUniversity();
    const r = await api().post("/api/auth/register").send(studentBody(uni.id));
    expect(r.status).toBe(201);
    expect(r.body.verificationRequired).toBe(true);
    expect(r.body.email).toBe("aliya@test.kz");
    expect(r.body.devCode).toMatch(/^\d{6}$/);
    expect(hasAuthCookie(r)).toBe(false);

    const row = await prisma.user.findUniqueOrThrow({ where: { email: "aliya@test.kz" } });
    expect(row.accountStatus).toBe("PENDING_VERIFICATION");
    expect(row.emailVerifiedAt).toBeNull();
    expect(row.passwordHash).not.toContain("secret123");
    expect(row.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare("secret123", row.passwordHash)).toBe(true);
  });

  it("код уходит на почту, в базе лежит только хэш", async () => {
    const uni = await createUniversity();
    outbox.length = 0;
    const r = await api().post("/api/auth/register").send(studentBody(uni.id));
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe("aliya@test.kz");
    expect(outbox[0].text).toContain(r.body.devCode);
    const row = await prisma.emailCode.findFirstOrThrow({});
    expect(row.codeHash).not.toContain(r.body.devCode);
  });

  it("верный код: аккаунт активируется, выдаются httpOnly-cookie", async () => {
    const uni = await createUniversity({ shortName: "ЕНУ" });
    const reg = await api().post("/api/auth/register").send(studentBody(uni.id));
    const r = await api().post("/api/auth/verify-email").send({ email: "aliya@test.kz", code: reg.body.devCode });
    expect(r.status).toBe(200);
    expect(r.body.user.role).toBe("STUDENT");
    expect(r.body.user.universityName).toBe("ЕНУ");
    expect(r.body.user.passwordHash).toBeUndefined();
    const access = cookies(r).find((c) => c.startsWith("access_token="));
    const refresh = cookies(r).find((c) => c.startsWith("refresh_token="));
    expect(access).toMatch(/HttpOnly/i);
    expect(access).toMatch(/SameSite=Lax/i);
    expect(refresh).toMatch(/Path=\/api\/auth/i);

    const row = await prisma.user.findUniqueOrThrow({ where: { email: "aliya@test.kz" } });
    expect(row.accountStatus).toBe("ACTIVE");
    expect(row.emailVerifiedAt).not.toBeNull();
    const profile = await prisma.studentProfile.findFirstOrThrow({ where: { userId: row.id } });
    expect(profile.universityId).toBe(uni.id);
  });

  it("неверный код → 400, после 5 ошибок верный код тоже не принимается", async () => {
    const uni = await createUniversity();
    const reg = await api().post("/api/auth/register").send(studentBody(uni.id));
    const wrong = reg.body.devCode === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const r = await api().post("/api/auth/verify-email").send({ email: "aliya@test.kz", code: wrong });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe("Неверный код");
    }
    const blocked = await api().post("/api/auth/verify-email").send({ email: "aliya@test.kz", code: reg.body.devCode });
    expect(blocked.status).toBe(429);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "aliya@test.kz" } })).accountStatus).toBe("PENDING_VERIFICATION");
  });

  it("просроченный код → 400", async () => {
    const uni = await createUniversity();
    const reg = await api().post("/api/auth/register").send(studentBody(uni.id));
    await prisma.emailCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await api().post("/api/auth/verify-email").send({ email: "aliya@test.kz", code: reg.body.devCode });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Код истёк. Запросите новый");
  });

  it("код нельзя использовать повторно и нельзя подтвердить чужой email", async () => {
    const uni = await createUniversity();
    const reg = await api().post("/api/auth/register").send(studentBody(uni.id));
    await api().post("/api/auth/register").send(studentBody(uni.id, { email: "other@test.kz" }));
    const cross = await api().post("/api/auth/verify-email").send({ email: "other@test.kz", code: reg.body.devCode });
    expect(cross.status).toBe(400);
    expect((await api().post("/api/auth/verify-email").send({ email: "aliya@test.kz", code: reg.body.devCode })).status).toBe(200);
    const again = await api().post("/api/auth/verify-email").send({ email: "aliya@test.kz", code: reg.body.devCode });
    expect(again.status).toBe(400);
  });

  it("повторная отправка раньше минуты не создаёт новый код; после минуты — присылает новый", async () => {
    const uni = await createUniversity();
    const reg = await api().post("/api/auth/register").send(studentBody(uni.id));
    const early = await api().post("/api/auth/resend-code").send({ email: "aliya@test.kz" });
    expect(early.status).toBe(200);
    expect(early.body.devCode).toBeUndefined();
    await prisma.emailCode.updateMany({ data: { createdAt: new Date(Date.now() - 61_000) } });
    const later = await api().post("/api/auth/resend-code").send({ email: "aliya@test.kz" });
    expect(later.body.devCode).toMatch(/^\d{6}$/);
    expect(await prisma.emailCode.count()).toBe(1);
    // старый код после выдачи нового недействителен (если коды различаются)
    if (later.body.devCode !== reg.body.devCode) {
      expect((await api().post("/api/auth/verify-email").send({ email: "aliya@test.kz", code: reg.body.devCode })).status).toBe(400);
    }
  });

  it("resend-code для неизвестного email отвечает так же, как для известного", async () => {
    const r = await api().post("/api/auth/resend-code").send({ email: "nobody@test.kz" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
  });

  it("до подтверждения вход закрыт: 403 EMAIL_NOT_VERIFIED и новый код; неверный пароль по-прежнему 401", async () => {
    const uni = await createUniversity();
    await api().post("/api/auth/register").send(studentBody(uni.id));
    await prisma.emailCode.deleteMany();
    const r = await api().post("/api/auth/login").send({ email: "aliya@test.kz", password: "secret123" });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("EMAIL_NOT_VERIFIED");
    expect(r.body.email).toBe("aliya@test.kz");
    expect(hasAuthCookie(r)).toBe(false);
    expect(await prisma.emailCode.count()).toBe(1);
    const bad = await api().post("/api/auth/login").send({ email: "aliya@test.kz", password: "wrong-pass" });
    expect(bad.status).toBe(401);
  });

  it("после подтверждения вход работает", async () => {
    const uni = await createUniversity();
    const reg = await api().post("/api/auth/register").send(studentBody(uni.id));
    await api().post("/api/auth/verify-email").send({ email: "aliya@test.kz", code: reg.body.devCode });
    const r = await api().post("/api/auth/login").send({ email: "aliya@test.kz", password: "secret123" });
    expect(r.status).toBe(200);
  });

  it("неподтверждённую регистрацию можно перезаписать (другой пароль, другие данные)", async () => {
    const uni = await createUniversity();
    await api().post("/api/auth/register").send(studentBody(uni.id, { password: "first-pass1" }));
    const second = await api().post("/api/auth/register").send(studentBody(uni.id, { password: "second-pass2", firstName: "Дана" }));
    expect(second.status).toBe(201);
    expect(await prisma.user.count({ where: { email: "aliya@test.kz" } })).toBe(1);
    const row = await prisma.user.findUniqueOrThrow({ where: { email: "aliya@test.kz" }, include: { student: true } });
    expect(row.student?.firstName).toBe("Дана");
    expect(await bcrypt.compare("second-pass2", row.passwordHash)).toBe(true);
  });

  it("студент привязывается к карточке ВУЗа из реестра, даже если у ВУЗа нет аккаунта", async () => {
    const reg = await prisma.registryUniversity.create({ data: { slug: "тест-ун|астана", name: "Тестовый университет", shortName: "ТУ", city: "Астана" } });
    const card = await prisma.user.create({ data: {
      role: "UNIVERSITY", accountStatus: "UNCLAIMED", email: "registry-x@practicekz.invalid", passwordHash: "!", city: "Астана",
      university: { create: { universityName: reg.name, shortName: reg.shortName, city: reg.city, registryId: reg.id } },
    } });
    const r = await api().post("/api/auth/register").send(studentBody(card.id));
    expect(r.status).toBe(201);
    const profile = await prisma.studentProfile.findFirstOrThrow({ where: { user: { email: "aliya@test.kz" } } });
    expect(profile.universityId).toBe(card.id);
  });

  it("email приводится к нижнему регистру и обрезается", async () => {
    const uni = await createUniversity();
    const r = await api().post("/api/auth/register").send(studentBody(uni.id, { email: "  Aliya@Test.KZ " }));
    expect(r.status).toBe(201);
    expect(r.body.email).toBe("aliya@test.kz");
  });

  it("повторный email активного пользователя (в другом регистре) → 409", async () => {
    const uni = await createUniversity();
    await createStudent(uni.id, { email: "taken@test.kz" });
    const r = await api().post("/api/auth/register").send(studentBody(uni.id, { email: "TAKEN@test.kz" }));
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("Пользователь с таким email уже зарегистрирован");
  });

  it("пароль короче 6 символов → 400", async () => {
    const uni = await createUniversity();
    const r = await api().post("/api/auth/register").send(studentBody(uni.id, { password: "12345" }));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Пароль — минимум 6 символов");
  });

  it("несуществующий университет → 400, пользователь не создан", async () => {
    const r = await api().post("/api/auth/register").send(studentBody("3f2b8c1e-5a47-4d0e-9b6a-1c2d3e4f5a6b"));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Выбранный университет не найден");
    expect(await prisma.user.count({ where: { email: "aliya@test.kz" } })).toBe(0);
  });

  it("в качестве «университета» нельзя выбрать студента или компанию", async () => {
    const company = await createCompany();
    const r = await api().post("/api/auth/register").send(studentBody(company.id));
    expect(r.status).toBe(400);
  });

  it("университетом нельзя зарегистрироваться → 400", async () => {
    const r = await api().post("/api/auth/register").send({ role: "UNIVERSITY", email: "x@test.kz", password: "secret123" });
    expect(r.status).toBe(400);
  });

  it("курс вне диапазона и пустое имя → 400", async () => {
    const uni = await createUniversity();
    expect((await api().post("/api/auth/register").send(studentBody(uni.id, { course: 7 }))).status).toBe(400);
    expect((await api().post("/api/auth/register").send(studentBody(uni.id, { firstName: "  " }))).status).toBe(400);
  });

  it("карточку ВУЗа без владельца (UNCLAIMED) войти нельзя", async () => {
    const card = await prisma.user.create({ data: {
      role: "UNIVERSITY", accountStatus: "UNCLAIMED", email: "registry-y@practicekz.invalid", passwordHash: "!", city: "Астана",
      university: { create: { universityName: "Карточка", shortName: "К", city: "Астана" } },
    } });
    const r = await api().post("/api/auth/login").send({ email: card.email, password: "!" });
    expect(r.status).toBe(401);
    const r2 = await api().post("/api/auth/login").send({ email: card.email, password: "123456" });
    expect(r2.status).toBe(401);
  });
});

describe("регистрация компании по БИН", () => {
  it("БИН найден в реестре: название берётся из реестра, а не из формы; компания помечена verified", async () => {
    const e = await createEntity({ name: "ТОО Реестровое Название", industry: "Логистика" });
    const r = await api().post("/api/auth/register").send(companyBody(e.bin, { companyName: "Подделка", industry: undefined }));
    expect(r.status).toBe(201);
    const code = r.body.devCode;
    const v = await api().post("/api/auth/verify-email").send({ email: "newco@test.kz", code });
    expect(v.status).toBe(200);
    expect(v.body.user.role).toBe("COMPANY");
    expect(v.body.user.company.companyName).toBe("ТОО Реестровое Название");
    expect(v.body.user.company.industry).toBe("Логистика");
    expect(v.body.user.company.bin).toBe(e.bin);
    expect(v.body.user.company.verified).toBe(true);
  });

  it("БИН можно вводить с пробелами и дефисами", async () => {
    const e = await createEntity();
    const spaced = `${e.bin.slice(0, 4)} ${e.bin.slice(4, 8)}-${e.bin.slice(8)}`;
    expect((await api().post("/api/auth/register").send(companyBody(spaced))).status).toBe(201);
  });

  it("БИН с неверной контрольной цифрой → 400", async () => {
    const e = await createEntity();
    const bad = e.bin.slice(0, 11) + ((Number(e.bin[11]) + 1) % 10);
    const r = await api().post("/api/auth/register").send(companyBody(bad));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Некорректный БИН: проверьте 12 цифр");
    expect(await prisma.user.count()).toBe(0);
  });

  it("валидный БИН, которого нет в реестре → 400", async () => {
    const e = await createEntity();
    await prisma.legalEntity.delete({ where: { bin: e.bin } });
    const r = await api().post("/api/auth/register").send(companyBody(e.bin));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Организация с таким БИН не найдена в реестре юридических лиц РК");
  });

  it("ликвидированная организация → 400", async () => {
    const e = await createEntity({ status: "LIQUIDATED" });
    const r = await api().post("/api/auth/register").send(companyBody(e.bin));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Организация с таким БИН не действует (ликвидирована)");
  });

  it("на один БИН — одна компания: второй аккаунт → 409", async () => {
    const e = await createEntity();
    const first = await api().post("/api/auth/register").send(companyBody(e.bin));
    await api().post("/api/auth/verify-email").send({ email: "newco@test.kz", code: first.body.devCode });
    const second = await api().post("/api/auth/register").send(companyBody(e.bin, { email: "second@test.kz" }));
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("Компания с таким БИН уже зарегистрирована");
  });

  it("неподтверждённая регистрация не блокирует БИН: настоящая компания может занять его", async () => {
    const e = await createEntity();
    await api().post("/api/auth/register").send(companyBody(e.bin, { email: "squatter@test.kz" }));
    const real = await api().post("/api/auth/register").send(companyBody(e.bin, { email: "real@test.kz" }));
    expect(real.status).toBe(201);
    expect(await prisma.user.count({ where: { email: "squatter@test.kz" } })).toBe(0);
  });

  it("без БИН → 400", async () => {
    const r = await api().post("/api/auth/register").send({ role: "COMPANY", city: "Алматы", email: "a@test.kz", password: "secret123" });
    expect(r.status).toBe(400);
  });
});

describe("вход и выход", () => {
  it("верные данные → 200, выданы обе cookie", async () => {
    const user = await createCompany();
    const r = await api().post("/api/auth/login").send({ email: user.email, password: PASSWORD });
    expect(r.status).toBe(200);
    expect(r.body.user.email).toBe(user.email);
    expect(r.body.user.passwordHash).toBeUndefined();
    expect(cookies(r).some((c) => c.startsWith("access_token="))).toBe(true);
    expect(cookies(r).some((c) => c.startsWith("refresh_token="))).toBe(true);
  });

  it("email при входе нечувствителен к регистру", async () => {
    const user = await createCompany({ email: "case@test.kz" });
    const r = await api().post("/api/auth/login").send({ email: "CASE@test.kz", password: PASSWORD });
    expect(r.status).toBe(200);
    expect(r.body.user.id).toBe(user.id);
  });

  it("неверный пароль и неизвестный email дают одинаковый ответ 401", async () => {
    const user = await createCompany();
    const wrongPass = await api().post("/api/auth/login").send({ email: user.email, password: "wrong-pass" });
    const noUser = await api().post("/api/auth/login").send({ email: "nobody@test.kz", password: PASSWORD });
    expect(wrongPass.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPass.body.error).toBe("Неверный email или пароль");
    expect(noUser.body.error).toBe("Неверный email или пароль");
  });

  it("пустой пароль → 400", async () => {
    const r = await api().post("/api/auth/login").send({ email: "a@test.kz", password: "" });
    expect(r.status).toBe(400);
  });

  it("logout сбрасывает сессию", async () => {
    const agent = await loginAs(await createCompany());
    expect((await agent.get("/api/auth/me")).status).toBe(200);
    expect((await agent.post("/api/auth/logout")).status).toBe(200);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });
});

describe("/me и токены", () => {
  it("без cookie → 401", async () => {
    const r = await api().get("/api/auth/me");
    expect(r.status).toBe(401);
    expect(r.body.error).toBe("Требуется авторизация");
  });

  it("студент получает профиль и название университета", async () => {
    const uni = await createUniversity({ shortName: "МНУ" });
    const stu = await createStudent(uni.id, { firstName: "Даулет" });
    const r = await (await loginAs(stu)).get("/api/auth/me");
    expect(r.status).toBe(200);
    expect(r.body.user.student.firstName).toBe("Даулет");
    expect(r.body.user.universityName).toBe("МНУ");
    expect(r.body.user.passwordHash).toBeUndefined();
  });

  it("мусор вместо токена → 401", async () => {
    const r = await api().get("/api/auth/me").set("Cookie", "access_token=garbage");
    expect(r.status).toBe(401);
    expect(r.body.error).toBe("Сессия истекла");
  });

  it("просроченный токен → 401", async () => {
    const user = await createCompany();
    const expired = jwt.sign({ sub: user.id, role: "COMPANY" }, process.env.JWT_ACCESS_SECRET!, { expiresIn: -10 });
    const r = await api().get("/api/auth/me").set("Cookie", `access_token=${expired}`);
    expect(r.status).toBe(401);
  });

  it("токен, подписанный чужим секретом → 401", async () => {
    const user = await createCompany();
    const forged = jwt.sign({ sub: user.id, role: "COMPANY" }, "another-secret-0123456789abcdef");
    const r = await api().get("/api/auth/me").set("Cookie", `access_token=${forged}`);
    expect(r.status).toBe(401);
  });

  it("токен удалённого пользователя → 401", async () => {
    const user = await createCompany();
    const agent = await loginAs(user);
    await prisma.user.delete({ where: { id: user.id } });
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("refresh выдаёт новую пару токенов, без cookie → 401", async () => {
    const agent = await loginAs(await createCompany());
    const ok = await agent.post("/api/auth/refresh");
    expect(ok.status).toBe(200);
    expect(cookies(ok).some((c) => c.startsWith("access_token="))).toBe(true);
    expect((await api().post("/api/auth/refresh")).status).toBe(401);
  });

  it("access-токен не годится как refresh", async () => {
    const user = await createCompany();
    const access = jwt.sign({ sub: user.id, role: "COMPANY" }, process.env.JWT_ACCESS_SECRET!);
    const r = await api().post("/api/auth/refresh").set("Cookie", `refresh_token=${access}`);
    expect(r.status).toBe(401);
  });
});

describe("смена пароля", () => {
  it("неверный текущий пароль → 400", async () => {
    const agent = await loginAs(await createCompany());
    const r = await agent.patch("/api/auth/me/password").send({ currentPassword: "nope-nope", newPassword: "newsecret1" });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Неверный текущий пароль");
  });

  it("новый пароль короче 6 символов → 400", async () => {
    const agent = await loginAs(await createCompany());
    const r = await agent.patch("/api/auth/me/password").send({ currentPassword: PASSWORD, newPassword: "123" });
    expect(r.status).toBe(400);
  });

  it("успех: старый пароль перестаёт работать, новый работает", async () => {
    const user = await createCompany();
    const agent = await loginAs(user);
    const r = await agent.patch("/api/auth/me/password").send({ currentPassword: PASSWORD, newPassword: "newsecret1" });
    expect(r.status).toBe(200);
    expect((await api().post("/api/auth/login").send({ email: user.email, password: PASSWORD })).status).toBe(401);
    expect((await api().post("/api/auth/login").send({ email: user.email, password: "newsecret1" })).status).toBe(200);
  });

  it("без входа → 401", async () => {
    const r = await api().patch("/api/auth/me/password").send({ currentPassword: PASSWORD, newPassword: "newsecret1" });
    expect(r.status).toBe(401);
  });
});

describe("защита маршрутов", () => {
  it("защищённые маршруты без входа → 401", async () => {
    for (const path of ["/api/applications", "/api/practices", "/api/students", "/api/companies", "/api/notifications", "/api/stats/student/overview"]) {
      const r = await api().get(path);
      expect(r.status, path).toBe(401);
    }
  });

  it("роли: студент не создаёт практику и не видит список студентов", async () => {
    const uni = await createUniversity();
    const agent = await loginAs(await createStudent(uni.id));
    expect((await agent.post("/api/practices").send({})).status).toBe(403);
    expect((await agent.get("/api/students")).status).toBe(403);
    expect((await agent.get("/api/companies")).status).toBe(403);
  });

  it("роли: компания не подаёт заявку, университет не создаёт практику", async () => {
    const company = await loginAs(await createCompany());
    const uni = await loginAs(await createUniversity());
    expect((await company.post("/api/applications").send({ practiceId: "3f2b8c1e-5a47-4d0e-9b6a-1c2d3e4f5a6b" })).status).toBe(403);
    expect((await uni.post("/api/practices").send({})).status).toBe(403);
  });

  it("CSRF: небезопасный запрос с чужим Origin → 403", async () => {
    const user = await createCompany();
    const r = await api().post("/api/auth/login").set("Origin", "http://evil.example").send({ email: user.email, password: PASSWORD });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("Недопустимый источник запроса");
  });

  it("CSRF: запрос с Origin фронтенда проходит", async () => {
    const user = await createCompany();
    const r = await api().post("/api/auth/login").set("Origin", "http://localhost:5173").send({ email: user.email, password: PASSWORD });
    expect(r.status).toBe(200);
  });

  it("health и неизвестный маршрут отвечают JSON", async () => {
    expect((await api().get("/api/health")).body).toEqual({ ok: true });
    const r = await api().get("/api/no-such-route");
    expect(r.status).toBe(404);
    expect(r.body.error).toBe("Не найдено");
  });

  it("заголовки helmet присутствуют", async () => {
    const r = await request(app).get("/api/health");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
  });
});
