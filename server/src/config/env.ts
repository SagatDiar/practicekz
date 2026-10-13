import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  PORT: z.coerce.number().default(4000),
  // лимит запросов на вход/регистрацию с одного IP за 15 минут (в тестах переопределяется)
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).default(50),
  // почта для кодов подтверждения; без SMTP_HOST письма печатаются в консоль сервера
  SMTP_HOST: z.string().optional().transform((v) => v || undefined),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional().transform((v) => v || undefined),
  SMTP_PASS: z.string().optional().transform((v) => v || undefined),
  MAIL_FROM: z.string().default("PracticeKZ <no-reply@practicekz.local>"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

// На Render адрес сайта известен автоматически
process.env.WEB_ORIGIN ||= process.env.RENDER_EXTERNAL_URL;
export const env = schema.parse(process.env);
