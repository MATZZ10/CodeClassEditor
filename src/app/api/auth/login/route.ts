import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  createSession,
  toPublicUser,
  validateUser,
} from "@/lib/authStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "Email dan password wajib diisi." },
        { status: 400 }
      );
    }

    const user = await validateUser(email, password);

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Email atau password salah." },
        { status: 401 }
      );
    }

    const session = await createSession(user.id);

    const response = NextResponse.json({
      ok: true,
      user: toPublicUser(user),
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: session.token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Login gagal.",
      },
      { status: 500 }
    );
  }
}