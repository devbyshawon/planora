import { useEffect, useRef, useState } from "react";
import { startReminders } from "./reminders.js";
export default function useBrowserReminders(
  user,
  { onOpen, onSessionExpired },
) {
  const callbacks = useRef({ onOpen, onSessionExpired });
  callbacks.current = { onOpen, onSessionExpired };
  const [message, setMessage] = useState(""),
    [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const refresh = () => setEpoch((v) => v + 1);
    window.addEventListener("focus", refresh);
    window.addEventListener("planora-notification-permission", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("planora-notification-permission", refresh);
    };
  }, []);
  useEffect(() => {
    if (!user.preferences.remindersEnabled) {
      setMessage("");
      return;
    }
    return startReminders({
      userId: user.id,
      onOpen: (id) => callbacks.current.onOpen(id),
      onSessionExpired: () => callbacks.current.onSessionExpired(),
      onStatus: setMessage,
    });
  }, [
    user.id,
    user.preferences.remindersEnabled,
    user.preferences.reminderMinutes,
    user.timeZone,
    epoch,
  ]);
  return message;
}
