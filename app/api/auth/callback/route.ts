import { NextRequest, NextResponse } from "next/server";

import { consumeOAuthState, createUserSession } from "@/lib/auth";
import { upsertUser } from "@/lib/db";
import { exchangeCodeForTokens, fetchGoogleProfile } from "@/lib/google";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/?error=Missing Google OAuth callback parameters.", request.url),
    );
  }

  const stateIsValid = await consumeOAuthState(state);
  if (!stateIsValid) {
    return NextResponse.redirect(new URL("/?error=Google OAuth state mismatch.", request.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const profile = await fetchGoogleProfile(tokens.access_token);
    const user = upsertUser({
      googleId: profile.sub,
      email: profile.email,
      name: profile.name,
      picture: profile.picture ?? null,
      accessToken: tokens.access_token,
      accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
      refreshToken: tokens.refresh_token ?? null,
    });

    await createUserSession(user.id);
    return NextResponse.redirect(new URL("/", request.url));
  } catch (responseError) {
    const message =
      responseError instanceof Error ? responseError.message : "Google sign-in failed.";
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(message)}`, request.url));
  }
}
