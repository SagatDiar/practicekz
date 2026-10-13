import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { post } from "../api/client";
import PageFrame from "../components/PageFrame";
import { useToast } from "../components/Toast";
import { useReference, useRefreshData } from "../hooks/useReference";

const FORMATS = ["Офис", "Удалённо", "Гибридный"] as const;
const schema = z.object({
  title: z.string().trim().min(2, "Введите название"),
  direction: z.string().trim().min(2, "Введите направление"),
  city: z.string().min(1, "Выберите город"),
  format: z.enum(FORMATS, { errorMap: () => ({ message: "Выберите формат" }) }),
  durationMonths: z.coerce.number().int().min(1, "От 1 до 6 месяцев").max(6, "От 1 до 6 месяцев"),
  places: z.coerce.number().int().min(1, "Минимум 1 место").max(100),
  description: z.string().trim().min(10, "Опишите практику подробнее"),
  requirements: z.string().trim().min(2, "Укажите требования"),
});
type Form = z.input<typeof schema>;

export default function AddPracticePage() {
  const nav = useNavigate();
  const toast = useToast();
  const refresh = useRefreshData();
  const cities = useReference("cities");
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { durationMonths: 2, places: 1 } });
  const create = useMutation({
    mutationFn: (d: unknown) => post("/practices", d),
    onSuccess: async () => { toast.ok("Практика опубликована"); await refresh(); nav("/company/practices"); },
    onError: (e) => toast.err((e as Error).message),
  });
  const err = (k: keyof Form) => errors[k] && <div className="text-danger small mt-1">{errors[k]!.message as string}</div>;

  return (
    <PageFrame title="Добавить практику">
      <form className="card border-0 shadow-sm" onSubmit={handleSubmit((d) => create.mutate(d))} noValidate>
        <div className="card-body p-4"><div className="row g-3">
          <div className="col-md-8"><label className="form-label">Название</label><input className="form-control" {...register("title")} />{err("title")}</div>
          <div className="col-md-4"><label className="form-label">Направление</label><input className="form-control" placeholder="IT, Маркетинг…" {...register("direction")} />{err("direction")}</div>
          <div className="col-md-4"><label className="form-label">Город</label>
            <select className="form-select" defaultValue="" {...register("city")}><option value="" disabled>Выберите город</option>{cities.map((c) => <option key={c}>{c}</option>)}</select>{err("city")}</div>
          <div className="col-md-4"><label className="form-label">Формат</label>
            <select className="form-select" defaultValue="" {...register("format")}><option value="" disabled>Выберите формат</option>{FORMATS.map((f) => <option key={f}>{f}</option>)}</select>{err("format")}</div>
          <div className="col-6 col-md-2"><label className="form-label">Срок, мес.</label><input type="number" min={1} max={6} className="form-control" {...register("durationMonths")} />{err("durationMonths")}</div>
          <div className="col-6 col-md-2"><label className="form-label">Мест</label><input type="number" min={1} className="form-control" {...register("places")} />{err("places")}</div>
          <div className="col-12"><label className="form-label">Описание</label><textarea rows={4} className="form-control" {...register("description")} />{err("description")}</div>
          <div className="col-12"><label className="form-label">Требования</label><textarea rows={3} className="form-control" {...register("requirements")} />{err("requirements")}</div>
        </div></div>
        <div className="card-footer bg-white p-3 text-end"><button className="btn btn-primary" disabled={create.isPending}>{create.isPending ? "Публикация…" : "Опубликовать"}</button></div>
      </form>
    </PageFrame>
  );
}
