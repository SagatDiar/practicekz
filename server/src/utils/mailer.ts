import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export interface Mail { to: string; subject: string; text: string }

/** Последние письма без SMTP (в тестах и разработке): тесты читают код отсюда. */
export const outbox: Mail[] = [];

export const smtpConfigured = () => Boolean(env.SMTP_HOST);

let transport: nodemailer.Transporter | undefined;

/**
 * Если SMTP_HOST не задан — письмо печатается в консоль сервера (режим разработки).
 * Иначе уходит через SMTP (порт 465 — SSL, 587 — STARTTLS).
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (!smtpConfigured()) {
    outbox.push(mail);
    if (outbox.length > 50) outbox.shift();
    if (env.NODE_ENV !== "test") console.log(`\n✉  [mail → ${mail.to}] ${mail.subject}\n${mail.text}\n`);
    return;
  }
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } : undefined,
  });
  await transport.sendMail({ from: env.MAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text });
}
