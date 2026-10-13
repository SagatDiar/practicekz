import { z } from "zod";

const email = z.string().trim().toLowerCase().email("Некорректный email");
const password = z.string().min(6, "Пароль — минимум 6 символов");

export const loginSchema = z.object({ email, password: z.string().min(1, "Введите пароль") });

const student = z.object({
  role: z.literal("STUDENT"),
  firstName: z.string().trim().min(1, "Введите имя"),
  lastName: z.string().trim().min(1, "Введите фамилию"),
  specialty: z.string().min(1, "Выберите специальность"),
  course: z.coerce.number().int().min(1).max(6),
  faculty: z.string().min(1, "Выберите факультет"),
  city: z.string().min(1, "Выберите город"),
  skills: z.string().trim().default(""),
  universityId: z.string().uuid("Выберите университет"),
  email, password,
});

// Компания регистрируется по БИН: название берётся из реестра юрлиц, а не вводится вручную
const company = z.object({
  role: z.literal("COMPANY"),
  bin: z.string().trim().min(1, "Введите БИН"),
  industry: z.string().trim().optional(),
  city: z.string().min(1, "Выберите город"),
  email, password,
});

export const registerSchema = z.discriminatedUnion("role", [student, company]);
export const verifyEmailSchema = z.object({ email, code: z.string().trim().regex(/^\d{6}$/, "Код — 6 цифр") });
export const resendSchema = z.object({ email });
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Введите текущий пароль"),
  newPassword: password,
});
