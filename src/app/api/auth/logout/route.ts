import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  await clearSession();
  return NextResponse.redirect(`${getEnv().appUrl}/`);
}
