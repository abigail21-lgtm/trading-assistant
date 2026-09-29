"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // updateViaCache "none": always check the network for a new sw.js, so
      // an update isn't held back by the browser's HTTP cache.
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    }
  }, []);

  return null;
}
