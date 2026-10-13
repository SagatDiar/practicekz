export class HttpError extends Error {
  /** code — машинное имя ошибки для фронтенда (например EMAIL_NOT_VERIFIED); extra — дополнительные поля ответа. */
  constructor(public status: number, message: string, public code?: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}
