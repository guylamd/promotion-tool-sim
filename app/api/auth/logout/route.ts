import { NextResponse } from "next/server";

import { clearUserSession } from "@/lib/auth";

export async function GET(request: Request) {
  await clearUserSession();
  return NextResponse.redirect(new URL("/", request.url));
}
