import { NextResponse } from "next/server";
import { db } from "@/db";
import { eventSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

// Constant-time compare to avoid leaking the code via timing.
function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function POST(req: Request) {
  const { code } = await req.json().catch(() => ({ code: "" }));
  const [settings] = await db
    .select({ eventCode: eventSettings.eventCode })
    .from(eventSettings)
    .where(eq(eventSettings.id, 1));
  const expected = settings?.eventCode ?? process.env.EVENT_CODE ?? "";
  if (expected && typeof code === "string" && timingSafeEqual(code.trim(), expected)) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false }, { status: 403 });
}
