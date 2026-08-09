"use client";

import { useState, useSyncExternalStore } from "react";
import { getNotificationPermission, requestNotificationPermission } from "@/lib/notifications";
import { subscribeToPush } from "@/lib/push-client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

function subscribe() {
  // The Notification API has no permission-change event to listen for;
  // this only ever updates in response to our own requestPermission() call.
  return () => {};
}

function getServerSnapshot(): NotificationPermission | "unsupported" {
  return "default";
}

export default function NotificationPermissionToggle() {
  const permission = useSyncExternalStore(subscribe, getNotificationPermission, getServerSnapshot);
  // requestPermission() resolving doesn't fire any event useSyncExternalStore
  // can subscribe to, so force a re-check of the snapshot once it settles.
  const [, forceRecheck] = useState(0);

  if (permission === "unsupported" || permission === "granted") return null;

  return (
    <button
      type="button"
      onClick={async () => {
        const result = await requestNotificationPermission();
        if (result === "granted" && isSupabaseConfigured) {
          // Best-effort: in-app notifications (below) still work even if
          // this fails, so a rejected/unsupported push subscription isn't
          // fatal to the overall flow.
          await subscribeToPush();
        }
        forceRecheck((n) => n + 1);
      }}
      className="w-full rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 transition hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900/60"
    >
      {isSupabaseConfigured
        ? "Enable notifications — works even when the app is closed"
        : "Enable browser notifications to receive alerts"}
    </button>
  );
}
