import { z } from "zod";

export const createApplicationSchema = z.object({ practiceId: z.string().uuid("Некорректная практика") });

export const diarySchema = z.object({
  date: z.coerce.date().optional(),
  text: z.string().trim().min(3, "Запись слишком короткая").max(3000, "Запись слишком длинная"),
});

export const reportSchema = z.object({
  text: z.string().trim().min(10, "Отчёт слишком короткий").max(10000, "Отчёт слишком длинный"),
});
