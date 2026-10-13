"use client";

import { useEffect } from "react";
import { rememberStock } from "@/lib/recent-stocks";

/** Records that this stock was viewed (see lib/recent-stocks). Renders nothing. */
export default function RememberStock({ symbol }: { symbol: string }) {
  useEffect(() => {
    rememberStock(symbol);
  }, [symbol]);
  return null;
}
