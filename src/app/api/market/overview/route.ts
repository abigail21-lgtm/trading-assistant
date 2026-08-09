import { NextResponse } from "next/server";
import { getManyQuoteSummaries } from "@/lib/market/yahoo";
import { MAJOR_INDICES, SECTORS } from "@/lib/market/symbols";

// Shared across all users/instances via Next.js's fetch cache (see lib/market/yahoo.ts).
export const revalidate = 300;

export async function GET() {
  const [indices, sectors] = await Promise.all([
    getManyQuoteSummaries(MAJOR_INDICES),
    getManyQuoteSummaries(SECTORS),
  ]);

  return NextResponse.json({ indices, sectors, fetchedAt: Date.now() });
}
