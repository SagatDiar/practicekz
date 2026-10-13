import { z } from "zod";

export const studentPatch = z.object({
  firstName: z.string().trim().min(1, "Введите имя").max(60),
  lastName: z.string().trim().min(1, "Введите фамилию").max(60),
  specialty: z.string().min(1, "Выберите специальность"),
  faculty: z.string().min(1, "Выберите факультет"),
  course: z.coerce.number().int().min(1).max(6),
  city: z.string().min(1, "Выберите город"),
  skills: z.string().trim().max(500),
}).partial();

export const companyPatch = z.object({
  companyName: z.string().trim().min(1, "Введите название").max(120),
  industry: z.string().trim().min(1, "Введите сферу деятельности").max(120),
  city: z.string().min(1, "Выберите город"),
}).partial();

export const universityPatch = z.object({
  universityName: z.string().trim().min(1, "Введите название").max(200),
  shortName: z.string().trim().min(1, "Введите сокращение").max(30),
  city: z.string().min(1, "Выберите город"),
}).partial();

export const extraSchema = z.object({
  type: z.enum(["CERTIFICATE", "ACHIEVEMENT"], { errorMap: () => ({ message: "Выберите тип" }) }),
  title: z.string().trim().min(2, "Введите название").max(150),
  organization: z.string().trim().min(2, "Введите организацию или курс").max(150),
  date: z.coerce.date({ errorMap: () => ({ message: "Укажите дату" }) })
    .refine((d) => d.getTime() <= Date.now() + 86400000, "Дата не может быть в будущем"),
});
