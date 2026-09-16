import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function useEmailUnreadCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function loadUnread() {
      try {
        const data = await api.get<{ count: number }>("/api/email/unread-count");
        if (mounted) setCount(data.count ?? 0);
      } catch {
        if (mounted) setCount(0);
      }
    }

    loadUnread();
    const timer = window.setInterval(loadUnread, 60_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  return count;
}
