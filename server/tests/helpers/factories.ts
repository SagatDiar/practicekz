import bcrypt from "bcryptjs";
import type { AppStatus } from "@prisma/client";
import { prisma } from "../../src/utils/db.js";
import { makeBin } from "../../src/utils/bin.js";

export const PASSWORD = "secret123";
export const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
export const ymd = (d: Date) => d.toISOString().slice(0, 10);

let cached: string | undefined;
const pwHash = async () => (cached ??= await bcrypt.hash(PASSWORD, 4)); // cost 4 — только для скорости тестов
let seq = 0;
const next = () => ++seq;

export interface TestUser { id: string; email: string }

export async function createUniversity(o: { shortName?: string; email?: string; city?: string } = {}): Promise<TestUser> {
  const i = next();
  const shortName = o.shortName ?? `УНИ${i}`;
  const email = o.email ?? `uni${i}@test.kz`;
  const city = o.city ?? "Астана";
  const u = await prisma.user.create({
    data: {
      role: "UNIVERSITY", email, passwordHash: await pwHash(), city,
      university: { create: { universityName: `Университет ${shortName}`, shortName, city } },
    },
  });
  return { id: u.id, email };
}

export async function createStudent(
  universityId: string,
  o: Partial<{ firstName: string; lastName: string; faculty: string; specialty: string; course: number; skills: string; city: string; email: string }> = {}
): Promise<TestUser> {
  const i = next();
  const email = o.email ?? `student${i}@test.kz`;
  const city = o.city ?? "Астана";
  const u = await prisma.user.create({
    data: {
      role: "STUDENT", email, passwordHash: await pwHash(), city,
      student: {
        create: {
          firstName: o.firstName ?? `Имя${i}`, lastName: o.lastName ?? `Фамилия${i}`, universityId,
          faculty: o.faculty ?? "Информационных технологий", specialty: o.specialty ?? "Информационные системы",
          course: o.course ?? 3, skills: o.skills ?? "SQL", city,
        },
      },
    },
  });
  return { id: u.id, email };
}

export async function createCompany(
  o: Partial<{ companyName: string; industry: string; city: string; email: string }> = {}
): Promise<TestUser> {
  const i = next();
  const email = o.email ?? `company${i}@test.kz`;
  const city = o.city ?? "Астана";
  const u = await prisma.user.create({
    data: {
      role: "COMPANY", email, passwordHash: await pwHash(), city,
      company: { create: { companyName: o.companyName ?? `Компания ${i}`, industry: o.industry ?? "IT", city } },
    },
  });
  return { id: u.id, email };
}

export async function createPractice(
  companyId: string,
  o: Partial<{ title: string; city: string; direction: string; durationMonths: number; format: string; places: number; datePublished: Date }> = {}
) {
  const i = next();
  return prisma.practice.create({
    data: {
      companyId, title: o.title ?? `Practice ${i}`, city: o.city ?? "Астана", direction: o.direction ?? "IT",
      description: "Описание практики для тестов", requirements: "Требования для тестов",
      durationMonths: o.durationMonths ?? 2, format: o.format ?? "Офис", places: o.places ?? 1,
      ...(o.datePublished ? { datePublished: o.datePublished } : {}),
    },
  });
}

const RUNNING: AppStatus[] = ["ACTIVE", "FINISH_REQUESTED", "COMPLETED"];

/**
 * Заявка сразу в нужном статусе. Для ACTIVE / FINISH_REQUESTED / COMPLETED все три подписи уже стоят.
 * Для SIGNING подписей нет, если не передать `signed`.
 */
export async function createApplication(o: {
  studentId: string; practiceId: string; status?: AppStatus; date?: Date; startDate?: Date;
  signed?: Partial<Record<"student" | "company" | "university", boolean>>;
}) {
  const practice = await prisma.practice.findUniqueOrThrow({ where: { id: o.practiceId } });
  const profile = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: o.studentId } });
  const status = o.status ?? "PENDING";
  const at = daysAgo(1);
  const sig = RUNNING.includes(status) ? { student: true, company: true, university: true } : (o.signed ?? {});
  return prisma.application.create({
    data: {
      studentId: o.studentId, practiceId: o.practiceId, companyId: practice.companyId, universityId: profile.universityId,
      status, date: o.date ?? new Date(),
      signedByStudent: !!sig.student, signedByStudentAt: sig.student ? at : null,
      signedByCompany: !!sig.company, signedByCompanyAt: sig.company ? at : null,
      signedByUniversity: !!sig.university, signedByUniversityAt: sig.university ? at : null,
      startDate: RUNNING.includes(status) ? (o.startDate ?? at) : null,
      completedDate: status === "COMPLETED" ? new Date() : null,
    },
  });
}

/** Юрлицо в реестре с валидным тестовым БИН. */
export async function createEntity(o: Partial<{ name: string; status: "ACTIVE" | "LIQUIDATED"; city: string; industry: string }> = {}) {
  const i = next();
  const bin = makeBin("2301", 1000 + i * 7);
  const e = await prisma.legalEntity.create({
    data: { bin, name: o.name ?? `ТОО Тестовая организация ${i}`, status: o.status ?? "ACTIVE", city: o.city ?? "Астана", industry: o.industry ?? "IT", source: "TEST" },
  });
  return e;
}
