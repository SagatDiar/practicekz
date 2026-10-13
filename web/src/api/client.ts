export class ApiError extends Error {
  constructor(public status: number, message: string, public data: Record<string, any> = {}) { super(message); }
}

async function raw(path: string, init: RequestInit) {
  const isForm = init.body instanceof FormData; // для FormData браузер сам ставит boundary
  return fetch(`/api${path}`, {
    credentials: "include",
    ...init,
    headers: { ...(init.body && !isForm ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await raw(path, init);
  // access-токен живёт 15 минут: один раз пробуем обновить через refresh
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const r = await raw("/auth/refresh", { method: "POST" });
    if (r.ok) res = await raw(path, init);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Ошибка запроса", data);
  return data as T;
}

const json = (body?: unknown) => (body === undefined ? undefined : JSON.stringify(body));
export const post = <T,>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: json(body) });
export const put = <T,>(path: string, body?: unknown) => api<T>(path, { method: "PUT", body: json(body) });
export const patch = <T,>(path: string, body?: unknown) => api<T>(path, { method: "PATCH", body: json(body) });
export const del = <T,>(path: string) => api<T>(path, { method: "DELETE" });
export const upload = <T,>(path: string, form: FormData) => api<T>(path, { method: "POST", body: form });
