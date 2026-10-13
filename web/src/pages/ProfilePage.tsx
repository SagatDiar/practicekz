import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, del, patch, upload } from "../api/client";
import type { ExtraItem } from "../api/models";
import { useAuth } from "../auth/AuthContext";
import PageFrame from "../components/PageFrame";
import Avatar from "../components/common/Avatar";
import { fmtDate } from "../components/common/Status";
import { useToast } from "../components/Toast";
import { useReference } from "../hooks/useReference";

const MAX = 5 * 1024 * 1024;

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const cities = useReference("cities");
  const faculties = useReference("faculties");
  const specialties = useReference("specialties");
  const me = user!;
  const [form, setForm] = useState<Record<string, string>>(() => ({
    ...(me.student ? { firstName: me.student.firstName, lastName: me.student.lastName, faculty: me.student.faculty, specialty: me.student.specialty,
      course: String(me.student.course), city: me.student.city, skills: me.student.skills } : {}),
    ...(me.company ? { companyName: me.company.companyName, industry: me.company.industry, city: me.company.city } : {}),
    ...(me.university ? { universityName: me.university.universityName, shortName: me.university.shortName, city: me.university.city } : {}),
  }));
  const set = (k: string) => (e: { target: { value: string } }) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => patch("/profile", form),
    onSuccess: async () => { await refresh(); toast.ok("Профиль сохранён"); },
    onError: (e) => toast.err((e as Error).message),
  });
  const photo = useMutation({
    mutationFn: (f: File) => { const fd = new FormData(); fd.append("photo", f); return upload("/profile/photo", fd); },
    onSuccess: async () => { await refresh(); toast.ok("Фото обновлено"); },
    onError: (e) => toast.err((e as Error).message),
  });
  const onPhoto = (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.err("Допускаются только изображения");
    if (f.size > MAX) return toast.err("Файл слишком большой (максимум 5 МБ)");
    photo.mutate(f);
  };

  const name = me.student ? `${me.student.firstName} ${me.student.lastName}` : me.company?.companyName ?? me.university?.shortName ?? "";
  const field = (label: string, k: string, input?: React.ReactNode, col = "col-md-6") =>
    <div className={col}><label className="form-label">{label}</label>{input ?? <input className="form-control" value={form[k] ?? ""} onChange={set(k)} />}</div>;
  const select = (k: string, opts: string[]) =>
    <select className="form-select" value={form[k] ?? ""} onChange={set(k)}>{!opts.includes(form[k]) && <option value={form[k]}>{form[k]}</option>}{opts.map((o) => <option key={o}>{o}</option>)}</select>;

  return (
    <PageFrame title={me.role === "COMPANY" ? "Профиль компании" : me.role === "UNIVERSITY" ? "Профиль университета" : "Мой профиль"}>
      <div className="row g-4">
        <div className="col-lg-8">
          <form className="card border-0 shadow-sm" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
            <div className="card-body p-4">
              <div className="d-flex align-items-center gap-3 mb-4">
                <Avatar fileId={me.photoFileId} name={name} size={80} />
                <div>
                  <div className="text-muted small mb-1">{me.email}{me.universityName ? ` · ${me.universityName}` : ""}</div>
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ""; }} />
                  <button type="button" className="btn btn-outline-primary btn-sm" disabled={photo.isPending} onClick={() => fileRef.current?.click()}>
                    <i className="bi bi-camera me-1" />{me.role === "STUDENT" ? "Сменить фото" : "Сменить логотип"}</button>
                </div>
              </div>
              <div className="row g-3">
                {me.student && <>
                  {field("Имя", "firstName")}{field("Фамилия", "lastName")}
                  {field("Факультет", "faculty", select("faculty", faculties))}{field("Специальность", "specialty", select("specialty", specialties))}
                  {field("Курс", "course", <select className="form-select" value={form.course} onChange={set("course")}>{[1, 2, 3, 4, 5, 6].map((c) => <option key={c}>{c}</option>)}</select>)}
                  {field("Город", "city", select("city", cities))}
                  {field("Навыки (через запятую)", "skills", undefined, "col-12")}
                </>}
                {me.company && <>{me.company.verified
                  ? <div className="col-12"><label className="form-label">Название компании</label>
                      <input className="form-control" value={me.company.companyName} disabled />
                      <div className="form-text text-success"><i className="bi bi-patch-check-fill me-1" />Проверено по реестру юрлиц РК · БИН {me.company.bin}</div></div>
                  : field("Название компании", "companyName")}{field("Сфера деятельности", "industry")}{field("Город", "city", select("city", cities))}</>}
                {me.university && <>{field("Название", "universityName")}{field("Сокращение", "shortName")}{field("Город", "city", select("city", cities))}</>}
              </div>
            </div>
            <div className="card-footer bg-white p-3 text-end"><button className="btn btn-primary" disabled={save.isPending}>{save.isPending ? "Сохранение…" : "Сохранить"}</button></div>
          </form>
        </div>
        {me.role === "STUDENT" && <div className="col-lg-4"><ExtraEducation /></div>}
      </div>
    </PageFrame>
  );
}

/** Сертификаты и достижения: добавление с файлом (PDF/JPG/PNG до 5 МБ), замена файла, удаление. */
function ExtraEducation() {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["profile", "extra"], queryFn: () => api<{ items: ExtraItem[] }>("/profile/extra").then((r) => r.items) });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ type: "CERTIFICATE", title: "", organization: "", date: new Date().toISOString().slice(0, 10) });
  const [file, setFile] = useState<File | null>(null);
  const done = (items: ExtraItem[]) => qc.setQueryData(["profile", "extra"], items);
  const checkFile = (x?: File | null) => {
    if (!x) return true;
    if (x.size > MAX) { toast.err("Файл слишком большой (максимум 5 МБ)"); return false; }
    if (!/\.(pdf|jpe?g|png|webp)$/i.test(x.name)) { toast.err("Допускаются PDF, JPG, PNG или WEBP"); return false; }
    return true;
  };

  const add = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append("file", file);
      return upload<{ items: ExtraItem[] }>("/profile/extra", fd);
    },
    onSuccess: (r) => { done(r.items); setOpen(false); setFile(null); setF({ ...f, title: "", organization: "" }); toast.ok("Добавлено"); },
    onError: (e) => toast.err((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del<{ items: ExtraItem[] }>(`/profile/extra/${id}`),
    onSuccess: (r) => { done(r.items); toast.ok("Удалено"); },
    onError: (e) => toast.err((e as Error).message),
  });
  const replace = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => { const fd = new FormData(); fd.append("file", file); return upload<{ items: ExtraItem[] }>(`/profile/extra/${id}/file`, fd); },
    onSuccess: (r) => { done(r.items); toast.ok("Файл заменён"); },
    onError: (e) => toast.err((e as Error).message),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); if (checkFile(file)) add.mutate(); };
  return (
    <div className="card border-0 shadow-sm"><div className="card-body">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="mb-0">Сертификаты и достижения</h6>
        <button className="btn btn-outline-primary btn-sm" onClick={() => setOpen(!open)}>{open ? "Отмена" : "Добавить"}</button>
      </div>
      {open && (
        <form className="border rounded-3 p-3 mb-3 bg-light" onSubmit={submit}>
          <select className="form-select mb-2" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="CERTIFICATE">Сертификат</option><option value="ACHIEVEMENT">Достижение</option></select>
          <input className="form-control mb-2" placeholder="Название" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={2} />
          <input className="form-control mb-2" placeholder="Организация или курс" value={f.organization} onChange={(e) => setF({ ...f, organization: e.target.value })} required minLength={2} />
          <input type="date" className="form-control mb-2" value={f.date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setF({ ...f, date: e.target.value })} required />
          <input type="file" className="form-control mb-2" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button className="btn btn-primary btn-sm" disabled={add.isPending}>{add.isPending ? "Сохранение…" : "Сохранить"}</button>
        </form>
      )}
      {q.isPending ? <div className="spinner-border spinner-border-sm text-primary" />
        : !q.data?.length ? <div className="text-muted small">Пока ничего не добавлено</div>
        : <ul className="list-group list-group-flush">{q.data.map((e) => (
          <li className="list-group-item px-0" key={e.id}>
            <span className={`badge me-2 ${e.type === "CERTIFICATE" ? "text-bg-primary" : "text-bg-warning"}`}>{e.type === "CERTIFICATE" ? "Сертификат" : "Достижение"}</span>
            <strong>{e.title}</strong>
            <div className="small text-muted">{e.organization} · {fmtDate(e.date)}</div>
            <div className="mt-1 d-flex flex-wrap gap-2 align-items-center">
              {e.file && <a className="small" href={`/api/files/${e.file.id}?download=1`}><i className="bi bi-paperclip" /> {e.file.originalName}</a>}
              <label className="small text-primary" role="button">{e.file ? "Заменить файл" : "Прикрепить файл"}
                <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(ev) => { const x = ev.target.files?.[0]; ev.target.value = ""; if (x && checkFile(x)) replace.mutate({ id: e.id, file: x }); }} /></label>
              <button className="btn btn-link btn-sm text-danger p-0 ms-auto" onClick={() => window.confirm("Удалить запись и файл?") && remove.mutate(e.id)}>Удалить</button>
            </div>
          </li>))}</ul>}
    </div></div>
  );
}
