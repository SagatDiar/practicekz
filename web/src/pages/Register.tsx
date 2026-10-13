import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { EntityLookup } from "../api/types";
import UniversityPicker from "../components/registry/UniversityPicker";
import BinLookup from "../components/registry/BinLookup";
import { homePath, useAuth } from "../auth/AuthContext";

const base = { email: z.string().trim().email("Некорректный email"), password: z.string().min(6, "Пароль — минимум 6 символов") };
const studentSchema = z.object({
  ...base,
  firstName: z.string().trim().min(1, "Введите имя"),
  lastName: z.string().trim().min(1, "Введите фамилию"),
  specialty: z.string().min(1, "Выберите специальность"),
  course: z.coerce.number().int().min(1).max(6),
  faculty: z.string().min(1, "Выберите факультет"),
  city: z.string().min(1, "Выберите город"),
  skills: z.string().default(""),
  universityId: z.string().min(1, "Выберите университет"),
});
const companySchema = z.object({
  ...base,
  bin: z.string().refine((v) => v.replace(/\D/g, "").length === 12, "БИН — 12 цифр"),
  industry: z.string().trim().optional(),
  city: z.string().min(1, "Выберите город"),
});

const useList = (name: string) =>
  useQuery({ queryKey: ["ref", name], queryFn: () => api<{ items: string[] }>(`/reference/${name}`).then((r) => r.items) });

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="form-label">{label}</label>
      {children}
      {error && <div className="text-danger small mt-1">{error}</div>}
    </div>
  );
}

export default function Register() {
  const { user, register: doRegister } = useAuth();
  const nav = useNavigate();
  const [role, setRole] = useState<"STUDENT" | "COMPANY">("STUDENT");
  const [error, setError] = useState("");
  const cities = useList("cities").data ?? [];
  const faculties = useList("faculties").data ?? [];
  const specialties = useList("specialties").data ?? [];

  if (user) return <Navigate to={homePath(user.role)} replace />;

  return (
    <div className="auth-wrap">
      <div className="card auth-card"><div className="card-body p-4 p-md-5">
        <div className="brand mb-3">Регистрация</div>
        <div className="btn-group w-100 mb-4">
          <button type="button" className={`btn ${role === "STUDENT" ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setRole("STUDENT")}>Студент</button>
          <button type="button" className={`btn ${role === "COMPANY" ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setRole("COMPANY")}>Компания</button>
        </div>
        {error && <div className="alert alert-danger py-2">{error}</div>}
        {/* key: при смене роли форма пересоздаётся с чистым состоянием */}
        <RegisterForm key={role} role={role} cities={cities} faculties={faculties} specialties={specialties}
          onSubmit={async (data) => {
            setError("");
            try {
              const r = await doRegister({ role, ...data, ...(role === "COMPANY" ? { bin: String(data.bin).replace(/\D/g, "") } : {}) });
              nav("/verify-email", { state: { email: r.email, devCode: r.devCode } });
            } catch (e) { setError((e as Error).message); }
          }} />
        <div className="text-center mt-3">Уже есть аккаунт? <Link to="/login">Войти</Link></div>
      </div></div>
    </div>
  );
}

type FormProps = {
  role: "STUDENT" | "COMPANY"; cities: string[]; faculties: string[]; specialties: string[];
  onSubmit: (d: Record<string, unknown>) => Promise<void>;
};

function RegisterForm({ role, cities, faculties, specialties, onSubmit }: FormProps) {
  const schema = role === "STUDENT" ? studentSchema : companySchema;
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<Record<string, any>>({ resolver: zodResolver(schema), defaultValues: { universityId: "", bin: "" } });
  const [entity, setEntity] = useState<EntityLookup | null>(null);
  const bin = (watch("bin") as string | undefined) ?? "";
  const universityId = (watch("universityId") as string | undefined) ?? "";
  // город организации из реестра подставляем, если он есть в нашем справочнике и пользователь ещё не выбрал свой
  useEffect(() => {
    if (entity?.city && cities.includes(entity.city) && !watch("city")) setValue("city", entity.city);
  }, [entity, cities]); // eslint-disable-line react-hooks/exhaustive-deps
  const companyOk = role !== "COMPANY" || (!!entity && entity.active && !entity.registered);
  const err = (k: string) => errors[k]?.message as string | undefined;
  const select = (k: string, opts: string[], ph: string) => (
    <select className="form-select" defaultValue="" {...register(k)}>
      <option value="" disabled>{ph}</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {role === "STUDENT" ? (
        <>
          <div className="row">
            <div className="col-6"><Field label="Имя" error={err("firstName")}><input className="form-control" {...register("firstName")} /></Field></div>
            <div className="col-6"><Field label="Фамилия" error={err("lastName")}><input className="form-control" {...register("lastName")} /></Field></div>
          </div>
          <Field label="Университет (реестр ВУЗов РК)" error={err("universityId")}>
            <UniversityPicker value={universityId} error={err("universityId")}
              onChange={(id) => setValue("universityId", id, { shouldValidate: true })} />
          </Field>
          <Field label="Специальность" error={err("specialty")}>{select("specialty", specialties, "Выберите специальность")}</Field>
          <Field label="Факультет / кафедра" error={err("faculty")}>{select("faculty", faculties, "Выберите факультет")}</Field>
          <div className="row">
            <div className="col-4"><Field label="Курс" error={err("course")}>
              <select className="form-select" defaultValue="1" {...register("course")}>{[1,2,3,4,5,6].map((c) => <option key={c} value={c}>{c}</option>)}</select>
            </Field></div>
            <div className="col-8"><Field label="Город" error={err("city")}>{select("city", cities, "Выберите город")}</Field></div>
          </div>
          <Field label="Навыки (через запятую)"><input className="form-control" placeholder="JavaScript, SQL" {...register("skills")} /></Field>
        </>
      ) : (
        <>
          <Field label="БИН организации" error={err("bin")}>
            <input className="form-control" inputMode="numeric" maxLength={20} placeholder="123456789012" {...register("bin")} />
            <BinLookup bin={bin} onResult={setEntity} />
          </Field>
          <Field label="Сфера деятельности (необязательно)"><input className="form-control" placeholder={entity?.industry ?? "IT, финансы, логистика…"} {...register("industry")} /></Field>
          <Field label="Город" error={err("city")}>{select("city", cities, "Выберите город")}</Field>
        </>
      )}
      <Field label="Email" error={err("email")}><input className="form-control" type="email" {...register("email")} /></Field>
      <Field label="Пароль" error={err("password")}><input className="form-control" type="password" {...register("password")} /></Field>
      <button className="btn btn-primary w-100" disabled={isSubmitting || !companyOk}>{isSubmitting ? "Создание…" : "Создать аккаунт"}</button>
      <div className="form-text text-center mt-2">После регистрации мы пришлём код подтверждения на email</div>
    </form>
  );
}
