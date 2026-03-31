import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, toPublicUser } from "@/lib/authStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Belum login." },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ok: true,
    user: toPublicUser(user),
  });
}