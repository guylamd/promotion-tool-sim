import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { theme?: string };
  const nextTheme = body.theme === "dark" ? "dark" : "light";

  const response = NextResponse.json({ ok: true });
  response.cookies.set("theme", nextTheme, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
