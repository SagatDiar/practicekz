import { z } from "zod";

export const FORMATS = ["Офис", "Удалённо", "Гибридный"] as const;

export const practiceSchema = z.object({
  title: z.string().trim().min(2, "Введите название").max(120),
  direction: z.string().trim().min(2, "Введите направление").max(80),
  city: z.string().trim().min(1, "Выберите город"),
  description: z.string().trim().min(10, "Опишите практику подробнее").max(4000),
  requirements: z.string().trim().min(2, "Укажите требования").max(2000),
  durationMonths: z.coerce.number().int().min(1, "Срок — от 1 до 6 месяцев").max(6, "Срок — от 1 до 6 месяцев"),
  format: z.enum(FORMATS, { errorMap: () => ({ message: "Выберите формат" }) }),
  places: z.coerce.number().int().min(1, "Минимум 1 место").max(100),
});
export const practiceUpdateSchema = practiceSchema.partial();

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().refine((n) => [10, 25, 50, 100].includes(n), "limit: 10, 25, 50 или 100").default(10),
  q: z.string().trim().optional(),
  mine: z.enum(["1", "0"]).optional(),
});
