import type { Notification, Prisma } from "@prisma/client";
import { prisma } from "../utils/db.js";
import { emitToUser } from "../realtime.js";

export interface NewNotification { userId: string; type: string; text: string; applicationId: string }

export const notificationView = (n: Notification) => ({
  id: n.id, type: n.type, text: n.text, applicationId: n.applicationId, read: n.read, createdAt: n.createdAt,
});

// созданные в транзакции уведомления ждут коммита: рассылаем только если транзакция завершилась успешно
const pending = new WeakMap<object, Notification[]>();

/** Пишется в той же транзакции, что и смена статуса; рассылка по сокетам — после коммита (runTx). */
export async function notify(tx: Prisma.TransactionClient, items: NewNotification[]) {
  if (!items.length) return;
  const created = await tx.notification.createManyAndReturn({ data: items });
  pending.set(tx, [...(pending.get(tx) ?? []), ...created]);
}

/** Обёртка над prisma.$transaction: после успешного коммита отправляет события пользователям. */
export async function runTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  let txRef: object | null = null;
  const result = await prisma.$transaction(async (tx) => {
    txRef = tx;
    return fn(tx);
  });
  const list = txRef ? pending.get(txRef) : undefined;
  if (txRef) pending.delete(txRef);
  for (const n of list ?? []) emitToUser(n.userId, "notification", notificationView(n));
  return result;
}
