import ComparePageClient from "@/components/ComparePageClient";
import { DEFAULT_COMPARE_RANGE, MAX_COMPARE_SYMBOLS } from "@/lib/market/compare";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ symbols?: string; range?: string }>;
}) {
  const { symbols: rawSymbols, range: rawRange } = await searchParams;
  const initialSymbols = (rawSymbols ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, MAX_COMPARE_SYMBOLS);

  return <ComparePageClient initialSymbols={initialSymbols} initialRange={rawRange ?? DEFAULT_COMPARE_RANGE} />;
}
