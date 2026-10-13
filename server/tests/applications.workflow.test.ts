import { randomUUID } from "node:crypto";
import type { AppStatus } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/utils/db.js";
import { createApplication, createCompany, createPractice, createStudent, createUniversity, daysAgo } from "./helpers/factories.js";
import { api, loginAs } from "./helpers/http.js";

/** Два университета, два студента одного вуза, две компании, практика первой компании. */
async function makeScene() {
  const uni = await createUniversity({ shortName: "ЕНУ" });
  const uni2 = await createUniversity({ shortName: "МНУ" });
  const student = await createStudent(uni.id, { firstName: "Арлан", lastName: "Серикбай" });
  const student2 = await createStudent(uni.id, { firstName: "Айдос", lastName: "Нурланов" });
  const company = await createCompany({ companyName: "Tech Solutions" });
  const company2 = await createCompany({ companyName: "QazaqSoft" });
  const practice = await createPractice(company.id, { title: "Backend Intern", durationMonths: 3 });
  return { uni, uni2, student, student2, company, company2, practice };
}
let s: Awaited<ReturnType<typeof makeScene>>;
beforeEach(async () => { s = await makeScene(); });

const ALL: AppStatus[] = ["PENDING", "INVITED", "REJECTED", "SIGNING", "ACTIVE", "FINISH_REQUESTED", "COMPLETED"];
const statusOf = async (id: string) => (await prisma.application.findUniqueOrThrow({ where: { id } })).status;
const notifCount = (userId: string, type?: string) => prisma.notification.count({ where: { userId, ...(type ? { type } : {}) } });
const appIn = (status: AppStatus, signed?: Parameters<typeof createApplication>[0]["signed"]) =>
  createApplication({ studentId: s.student.id, practiceId: s.practice.id, status, signed });

describe("создание заявки", () => {
  it("студент подаёт заявку: 201, PENDING, уведомления компании и университету", async () => {
    const r = await (await loginAs(s.student)).post("/api/applications").send({ practiceId: s.practice.id });
    expect(r.status).toBe(201);
    expect(r.body.application.status).toBe("PENDING");
    expect(r.body.application.company.name).toBe("Tech Solutions");
    expect(r.body.application.university.name).toBe("ЕНУ");
    expect(await notifCount(s.company.id, "APPLICATION_NEW")).toBe(1);
    expect(await notifCount(s.uni.id, "APPLICATION_NEW")).toBe(1);
    expect(await notifCount(s.student.id)).toBe(0);
  });

  it("университет и компания в заявке берутся с сервера, а не из тела запроса", async () => {
    const r = await (await loginAs(s.student)).post("/api/applications")
      .send({ practiceId: s.practice.id, companyId: s.company2.id, universityId: s.uni2.id, status: "ACTIVE" });
    expect(r.status).toBe(201);
    const row = await prisma.application.findUniqueOrThrow({ where: { id: r.body.application.id } });
    expect(row).toMatchObject({ companyId: s.company.id, universityId: s.uni.id, status: "PENDING" });
  });

  it("повторная заявка на ту же практику → 409, дубля нет", async () => {
    const agent = await loginAs(s.student);
    await agent.post("/api/applications").send({ practiceId: s.practice.id });
    const r = await agent.post("/api/applications").send({ practiceId: s.practice.id });
    expect(r.status).toBe(409);
    expect(await prisma.application.count()).toBe(1);
  });

  it("два студента могут подать заявку на одну практику", async () => {
    expect((await (await loginAs(s.student)).post("/api/applications").send({ practiceId: s.practice.id })).status).toBe(201);
    expect((await (await loginAs(s.student2)).post("/api/applications").send({ practiceId: s.practice.id })).status).toBe(201);
  });

  it("несуществующая практика → 404, неверный id → 400", async () => {
    const agent = await loginAs(s.student);
    expect((await agent.post("/api/applications").send({ practiceId: randomUUID() })).status).toBe(404);
    expect((await agent.post("/api/applications").send({ practiceId: "abc" })).status).toBe(400);
    expect((await agent.post("/api/applications").send({})).status).toBe(400);
  });

  it("компания и университет подавать заявку не могут → 403", async () => {
    expect((await (await loginAs(s.company)).post("/api/applications").send({ practiceId: s.practice.id })).status).toBe(403);
    expect((await (await loginAs(s.uni)).post("/api/applications").send({ practiceId: s.practice.id })).status).toBe(403);
  });
});

describe("полный цикл", () => {
  it("заявка → приглашение → одобрение → 3 подписи → практика → дневник → отчёт → завершение", async () => {
    const stu = await loginAs(s.student);
    const cmp = await loginAs(s.company);
    const uni = await loginAs(s.uni);
    const post = (a: typeof stu, id: string, action: string) => a.post(`/api/applications/${id}/${action}`);

    const id = (await stu.post("/api/applications").send({ practiceId: s.practice.id })).body.application.id;

    let r = await post(cmp, id, "invite");
    expect(r.body.application.status).toBe("INVITED");
    expect(await notifCount(s.student.id, "APPLICATION_INVITE")).toBe(1);

    r = await post(cmp, id, "approve");
    expect(r.body.application.status).toBe("SIGNING");
    expect(Object.values(r.body.application.signatures).map((x: any) => x.signed)).toEqual([false, false, false]);
    expect(await notifCount(s.student.id, "APPLICATION_APPROVE")).toBe(1);
    expect(await notifCount(s.uni.id, "APPLICATION_APPROVE")).toBe(1);

    r = await post(stu, id, "sign");
    expect(r.body.application.status).toBe("SIGNING");
    expect(r.body.application.signatures.student.signed).toBe(true);
    expect(r.body.application.signatures.student.at).toBeTruthy();
    // ждут подписи компания и университет; сам студент уведомления не получает
    expect(await notifCount(s.company.id, "SIGNED")).toBe(1);
    expect(await notifCount(s.uni.id, "SIGNED")).toBe(1);
    expect(await notifCount(s.student.id, "SIGNED")).toBe(0);

    r = await post(cmp, id, "sign");
    expect(r.body.application.status).toBe("SIGNING");
    expect(await notifCount(s.uni.id, "SIGNED")).toBe(2);

    r = await post(uni, id, "sign");
    expect(r.body.application.status).toBe("ACTIVE");
    expect(r.body.application.startDate).toBeTruthy();
    expect(r.body.application.progress.percent).toBe(0);
    for (const userId of [s.student.id, s.company.id, s.uni.id]) expect(await notifCount(userId, "PRACTICE_STARTED")).toBe(1);

    r = await stu.post(`/api/applications/${id}/diary`).send({ text: "Первый день: знакомство с командой" });
    expect(r.status).toBe(201);
    expect(await notifCount(s.company.id, "DIARY_ADDED")).toBe(1);

    r = await stu.put(`/api/applications/${id}/report`).send({ text: "Промежуточный отчёт по практике" });
    expect(r.status).toBe(200);
    expect(await notifCount(s.company.id, "REPORT_SUBMITTED")).toBe(1);
    expect(await notifCount(s.uni.id, "REPORT_SUBMITTED")).toBe(1);

    r = await post(stu, id, "request-finish");
    expect(r.body.application.status).toBe("FINISH_REQUESTED");
    expect(await notifCount(s.company.id, "FINISH_REQUESTED")).toBe(1);

    r = await post(cmp, id, "confirm-finish");
    expect(r.body.application.status).toBe("COMPLETED");
    expect(r.body.application.completedDate).toBeTruthy();
    expect(r.body.application.progress.percent).toBe(100);
    expect(await notifCount(s.student.id, "COMPLETED")).toBe(1);
    expect(await notifCount(s.uni.id, "COMPLETED")).toBe(1);

    // компания и университет читают дневник и отчёт
    r = await cmp.get(`/api/applications/${id}`);
    expect(r.body.application.diary).toHaveLength(1);
    expect(r.body.application.reportText).toBe("Промежуточный отчёт по практике");
    expect((await uni.get(`/api/applications/${id}`)).body.application.diary).toHaveLength(1);
  });

  it("подписи можно ставить в любом порядке", async () => {
    const app = await appIn("SIGNING");
    for (const who of [s.uni, s.student, s.company]) {
      await (await loginAs(who)).post(`/api/applications/${app.id}/sign`);
    }
    expect(await statusOf(app.id)).toBe("ACTIVE");
  });

  it("одобрение сбрасывает прежние подписи", async () => {
    const app = await createApplication({ studentId: s.student.id, practiceId: s.practice.id, status: "INVITED", signed: { student: true, company: true } });
    const r = await (await loginAs(s.company)).post(`/api/applications/${app.id}/approve`);
    expect(r.status).toBe(200);
    const row = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect([row.signedByStudent, row.signedByCompany, row.signedByUniversity]).toEqual([false, false, false]);
    expect(row.signedByStudentAt).toBeNull();
  });

  it("отклонение уведомляет студента и университет", async () => {
    const app = await appIn("PENDING");
    expect((await (await loginAs(s.company)).post(`/api/applications/${app.id}/reject`)).status).toBe(200);
    expect(await statusOf(app.id)).toBe("REJECTED");
    expect(await notifCount(s.student.id, "APPLICATION_REJECT")).toBe(1);
    expect(await notifCount(s.uni.id, "APPLICATION_REJECT")).toBe(1);
  });

  it("три подписи одновременно: ровно один переход в ACTIVE и три уведомления", async () => {
    const app = await appIn("SIGNING");
    const agents = await Promise.all([s.student, s.company, s.uni].map(loginAs));
    const results = await Promise.all(agents.map((a) => a.post(`/api/applications/${app.id}/sign`)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const row = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(row.status).toBe("ACTIVE");
    expect(row.startDate).not.toBeNull();
    expect(await prisma.notification.count({ where: { type: "PRACTICE_STARTED", applicationId: app.id } })).toBe(3);
  });

  it("два одновременных запроса «одобрить»: один успех, второй 409", async () => {
    const app = await appIn("PENDING");
    const cmp = await loginAs(s.company);
    const rs = await Promise.all([cmp.post(`/api/applications/${app.id}/approve`), cmp.post(`/api/applications/${app.id}/approve`)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.notification.count({ where: { type: "APPLICATION_APPROVE", userId: s.student.id } })).toBe(1);
  });
});

// ---------------- таблица переходов ----------------
const TRANSITIONS: { action: string; actor: "company" | "student"; from: AppStatus[]; to: AppStatus }[] = [
  { action: "invite", actor: "company", from: ["PENDING"], to: "INVITED" },
  { action: "approve", actor: "company", from: ["PENDING", "INVITED"], to: "SIGNING" },
  { action: "reject", actor: "company", from: ["PENDING", "INVITED"], to: "REJECTED" },
  { action: "request-finish", actor: "student", from: ["ACTIVE"], to: "FINISH_REQUESTED" },
  { action: "confirm-finish", actor: "company", from: ["FINISH_REQUESTED"], to: "COMPLETED" },
];

describe("таблица переходов: действие × статус", () => {
  for (const t of TRANSITIONS) {
    for (const from of ALL) {
      const allowed = t.from.includes(from);
      it(`${t.action} из ${from} → ${allowed ? `200, ${t.to}` : "409, статус не меняется"}`, async () => {
        const app = await appIn(from);
        const agent = await loginAs(s[t.actor]);
        const r = await agent.post(`/api/applications/${app.id}/${t.action}`);
        expect(r.status).toBe(allowed ? 200 : 409);
        expect(await statusOf(app.id)).toBe(allowed ? t.to : from);
        if (!allowed) expect(await prisma.notification.count()).toBe(0);
      });
    }
  }

  for (const who of ["student", "company", "uni"] as const) {
    for (const from of ALL) {
      const allowed = from === "SIGNING";
      it(`подпись (${who}) в статусе ${from} → ${allowed ? 200 : 409}`, async () => {
        const app = await appIn(from);
        const r = await (await loginAs(s[who])).post(`/api/applications/${app.id}/sign`);
        expect(r.status).toBe(allowed ? 200 : 409);
        if (!allowed) expect(await statusOf(app.id)).toBe(from);
      });
    }
  }

  it("повторная подпись той же стороны → 409", async () => {
    const app = await appIn("SIGNING", { student: true });
    const r = await (await loginAs(s.student)).post(`/api/applications/${app.id}/sign`);
    expect(r.status).toBe(409);
  });
});

describe("права на переходы", () => {
  it("чужая компания не может приглашать, одобрять, отклонять и подтверждать → 403", async () => {
    const other = await loginAs(s.company2);
    const cases: [string, AppStatus][] = [["invite", "PENDING"], ["approve", "PENDING"], ["reject", "PENDING"], ["confirm-finish", "FINISH_REQUESTED"]];
    for (const [action, status] of cases) {
      const app = await appIn(status);
      const r = await other.post(`/api/applications/${app.id}/${action}`);
      expect(r.status, action).toBe(403);
      expect(await statusOf(app.id), action).toBe(status);
      await prisma.application.delete({ where: { id: app.id } });
    }
  });

  it("чужой студент не может завершить практику → 403", async () => {
    const app = await appIn("ACTIVE");
    const r = await (await loginAs(s.student2)).post(`/api/applications/${app.id}/request-finish`);
    expect(r.status).toBe(403);
    expect(await statusOf(app.id)).toBe("ACTIVE");
  });

  it("чужие стороны не могут подписывать: студент, компания, университет → 403", async () => {
    const app = await appIn("SIGNING");
    for (const outsider of [s.student2, s.company2, s.uni2]) {
      const r = await (await loginAs(outsider)).post(`/api/applications/${app.id}/sign`);
      expect(r.status).toBe(403);
    }
    const row = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect([row.signedByStudent, row.signedByCompany, row.signedByUniversity]).toEqual([false, false, false]);
  });

  it("неподходящая роль: студент не приглашает, компания не завершает за студента, университет не одобряет → 403", async () => {
    const app = await appIn("PENDING");
    expect((await (await loginAs(s.student)).post(`/api/applications/${app.id}/invite`)).status).toBe(403);
    expect((await (await loginAs(s.uni)).post(`/api/applications/${app.id}/approve`)).status).toBe(403);
    await prisma.application.update({ where: { id: app.id }, data: { status: "ACTIVE" } });
    expect((await (await loginAs(s.company)).post(`/api/applications/${app.id}/request-finish`)).status).toBe(403);
  });

  it("несуществующая заявка → 404 на любом действии", async () => {
    const cmp = await loginAs(s.company);
    const stu = await loginAs(s.student);
    for (const action of ["invite", "approve", "reject", "confirm-finish"]) {
      expect((await cmp.post(`/api/applications/${randomUUID()}/${action}`)).status, action).toBe(404);
    }
    expect((await stu.post(`/api/applications/${randomUUID()}/request-finish`)).status).toBe(404);
    expect((await stu.post(`/api/applications/${randomUUID()}/sign`)).status).toBe(404);
  });

  it("без входа → 401", async () => {
    const app = await appIn("PENDING");
    expect((await api().post(`/api/applications/${app.id}/invite`)).status).toBe(401);
    expect((await api().get(`/api/applications/${app.id}`)).status).toBe(401);
  });
});

describe("видимость заявки", () => {
  it("видят участники: студент, компания, университет", async () => {
    const app = await appIn("PENDING");
    for (const who of [s.student, s.company, s.uni]) {
      const r = await (await loginAs(who)).get(`/api/applications/${app.id}`);
      expect(r.status).toBe(200);
      expect(r.body.application.id).toBe(app.id);
    }
  });

  it("посторонние получают 404, а не 403 (существование заявки не раскрывается)", async () => {
    const app = await appIn("PENDING");
    for (const who of [s.student2, s.company2, s.uni2]) {
      expect((await (await loginAs(who)).get(`/api/applications/${app.id}`)).status).toBe(404);
    }
  });
});

describe("дневник и отчёт", () => {
  const NOT_RUNNING: AppStatus[] = ["PENDING", "INVITED", "REJECTED", "SIGNING"];
  const RUNNING: AppStatus[] = ["ACTIVE", "FINISH_REQUESTED", "COMPLETED"];

  for (const st of NOT_RUNNING) {
    it(`в статусе ${st} дневник и отчёт → 409`, async () => {
      const app = await appIn(st);
      const stu = await loginAs(s.student);
      expect((await stu.post(`/api/applications/${app.id}/diary`).send({ text: "Запись в дневник" })).status).toBe(409);
      expect((await stu.put(`/api/applications/${app.id}/report`).send({ text: "Итоговый отчёт по практике" })).status).toBe(409);
      expect(await prisma.diaryEntry.count()).toBe(0);
    });
  }

  for (const st of RUNNING) {
    it(`в статусе ${st} студент пишет в дневник и сохраняет отчёт`, async () => {
      const app = await appIn(st);
      const stu = await loginAs(s.student);
      expect((await stu.post(`/api/applications/${app.id}/diary`).send({ text: "Запись в дневник" })).status).toBe(201);
      const r = await stu.put(`/api/applications/${app.id}/report`).send({ text: "Итоговый отчёт по практике" });
      expect(r.status).toBe(200);
      expect(r.body.application.reportText).toBe("Итоговый отчёт по практике");
      expect(r.body.application.reportDate).toBeTruthy();
    });
  }

  it("компания и университет только читают: запись и отчёт → 403", async () => {
    const app = await appIn("ACTIVE");
    for (const who of [s.company, s.uni]) {
      const agent = await loginAs(who);
      expect((await agent.post(`/api/applications/${app.id}/diary`).send({ text: "Запись в дневник" })).status).toBe(403);
      expect((await agent.put(`/api/applications/${app.id}/report`).send({ text: "Итоговый отчёт по практике" })).status).toBe(403);
    }
  });

  it("чужой студент не пишет в чужой дневник → 403", async () => {
    const app = await appIn("ACTIVE");
    const stu2 = await loginAs(s.student2);
    expect((await stu2.post(`/api/applications/${app.id}/diary`).send({ text: "Запись в дневник" })).status).toBe(403);
    expect((await stu2.put(`/api/applications/${app.id}/report`).send({ text: "Итоговый отчёт по практике" })).status).toBe(403);
  });

  it("валидация: короткая и слишком длинная запись, дата в будущем", async () => {
    const app = await appIn("ACTIVE");
    const stu = await loginAs(s.student);
    const post = (body: object) => stu.post(`/api/applications/${app.id}/diary`).send(body);
    expect((await post({ text: "ab" })).status).toBe(400);
    expect((await post({ text: "x".repeat(3001) })).status).toBe(400);
    const future = await post({ text: "Запись из будущего", date: new Date(Date.now() + 3 * 86400000).toISOString() });
    expect(future.status).toBe(400);
    expect(future.body.error).toBe("Дата записи не может быть в будущем");
    expect((await post({ text: "Запись за вчера", date: daysAgo(1).toISOString() })).status).toBe(201);
  });

  it("валидация отчёта: короче 10 символов → 400", async () => {
    const app = await appIn("ACTIVE");
    const r = await (await loginAs(s.student)).put(`/api/applications/${app.id}/report`).send({ text: "коротко" });
    expect(r.status).toBe(400);
  });

  it("прогресс считается от startDate: 30 дней из 90 → 33%", async () => {
    const app = await createApplication({ studentId: s.student.id, practiceId: s.practice.id, status: "ACTIVE", startDate: daysAgo(30) });
    const r = await (await loginAs(s.student)).get(`/api/applications/${app.id}`);
    expect(r.body.application.progress).toMatchObject({ percent: 33, elapsedDays: 30, remainingDays: 60, totalDays: 90 });
  });
});
