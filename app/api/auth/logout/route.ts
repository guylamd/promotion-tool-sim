import { NextResponse } from "next/server";

import { clearUserSession } from "@/lib/auth";
import { getAppUrl } from "@/lib/env";

export async function GET(request: Request) {
  const appBase = getAppUrl();
  await clearUserSession();
  return NextResponse.redirect(new URL("/", appBase));
}
