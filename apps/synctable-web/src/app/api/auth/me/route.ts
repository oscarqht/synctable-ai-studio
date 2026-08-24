import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  fetchRaindropUser,
  getAuthCookieOptions,
  getRaindropTokenFromEnv,
} from "@/lib/raindrop";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "")?.trim();
  const queryToken = request.nextUrl.searchParams.get("token")?.trim();
  const cookieToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value?.trim();
  const envToken = getRaindropTokenFromEnv();

  let token = authHeader || queryToken || cookieToken || envToken;

  if (!token) {
    return NextResponse.json({ user: null });
  }

  let user = await fetchRaindropUser(token);

  // If the provided token failed, fallback to environment RAINDROP_TOKEN if available
  if (!user && (authHeader || queryToken || cookieToken) && envToken && token !== envToken) {
    user = await fetchRaindropUser(envToken);
    if (user) {
      token = envToken;
    }
  }

  if (!user) {
    const response = NextResponse.json({ user: null });
    // Token is no longer valid, clear cookie if one was present
    if (cookieToken) {
      response.cookies.set(ACCESS_TOKEN_COOKIE, "", getAuthCookieOptions(0));
    }
    return response;
  }

  return NextResponse.json({ user, token });
}
