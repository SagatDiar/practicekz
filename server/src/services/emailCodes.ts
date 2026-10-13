import crypto from "node:crypto";
import { env } from "../config/env.js";
import { prisma } from "../utils/db.js";
import { HttpError } from "../utils/httpError.js";
import { sendMail, smtpConfigured } from "../utils/mailer.js";

export const CODE_TTL_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60 * 1000;

const hash = (userId: string, code: string) =>
  crypto.createHmac("sha256", env.JWT_ACCESS_SECRET).update(`${userId}:${code}`).digest("hex");

/** Создаёт новый код (старые аннулируются) и отправляет письмо. Возвращает код только в dev/test без SMTP. */
export async function issueEmailCode(user: { id: string; email: string }): Promise<{ devCode?: string }> {
  const last = await prisma.emailCode.findFirst({ where: { userId: user.id, purpose: "VERIFY_EMAIL" }, orderBy: { createdAt: "desc" } });
  if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - last.createdAt.getTime())) / 1000);
    throw new HttpError(429, `Код уже отправлен. Повторить можно через ${wait} с`);
  }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.$transaction([
    prisma.emailCode.deleteMany({ where: { userId: user.id, purpose: "VERIFY_EMAIL" } }),
    prisma.emailCode.create({ data: { userId: user.id, codeHash: hash(user.id, code), expiresAt: new Date(Date.now() + CODE_TTL_MS) } }),
  ]);
  await sendMail({
    to: user.email,
    subject: "PracticeKZ: код подтверждения email",
    text: `Ваш код подтверждения: ${code}\nОн действителен 15 минут. Если вы не регистрировались на PracticeKZ — проигнорируйте это письмо.`,
  });
  return env.NODE_ENV !== "production" && !smtpConfigured() ? { devCode: code } : {};
}

/** Проверяет код; при успехе помечает email подтверждённым и активирует аккаунт. */
export async function consumeEmailCode(userId: string, code: string): Promise<void> {
  const row = await prisma.emailCode.findFirst({ where: { userId, purpose: "VERIFY_EMAIL", consumedAt: null }, orderBy: { createdAt: "desc" } });
  if (!row || row.expiresAt.getTime() < Date.now()) throw new HttpError(400, "Код истёк. Запросите новый");
  if (row.attempts >= MAX_ATTEMPTS) throw new HttpError(429, "Слишком много неверных попыток. Запросите новый код");

  const a = Buffer.from(row.codeHash, "hex");
  const b = Buffer.from(hash(userId, code), "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await prisma.emailCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    throw new HttpError(400, "Неверный код");
  }
  await prisma.$transaction([
    prisma.emailCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } }),
    prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date(), accountStatus: "ACTIVE" } }),
  ]);
}
