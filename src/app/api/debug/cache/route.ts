import { NextResponse } from "next/server";
import { getBitableCacheStatus } from "@/lib/bitable";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const suppliedSecret = url.searchParams.get("secret") || "";
  const cronSecret = process.env.CRON_SECRET || "";

  if (!cronSecret || suppliedSecret !== cronSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json(getBitableCacheStatus(), {
    headers: { "Cache-Control": "no-store" }
  });
}
