import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { useAuth } from "../auth/AuthContext";
import type { Notice, NoticePage } from "../api/notifications";
import { useToast } from "./Toast";
import { useRefreshData } from "../hooks/useReference";

/** Одно соединение на сессию. Новое событие: toast, обновление колокольчика и всех списков/сводок без перезагрузки. */
export default function RealtimeProvider() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const refreshData = useRefreshData();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    const socket = io({ withCredentials: true, transports: ["websocket", "polling"] });

    socket.on("notification", (n: Notice) => {
      toast.info(n.text);
      // сразу показываем в колокольчике, не дожидаясь запроса; список подтянется следом
      qc.setQueryData<NoticePage>(["notifications", "list"], (old) =>
        old && !old.items.some((x) => x.id === n.id)
          ? { ...old, items: [n, ...old.items].slice(0, 20), unread: old.unread + 1, total: old.total + 1 }
          : old);
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void refreshData();
    });
    // после обрыва связи события могли пропасть — перечитываем всё
    socket.io.on("reconnect", () => { void qc.invalidateQueries({ queryKey: ["notifications"] }); void refreshData(); });

    return () => { socket.disconnect(); };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
