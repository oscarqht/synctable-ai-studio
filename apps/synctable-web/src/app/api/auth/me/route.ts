import { NextRequest, NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE, fetchRaindropUser, getAuthCookieOptions } from "@/lib/raindrop";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "")?.trim();
  const queryToken = request.nextUrl.searchParams.get("token")?.trim();
  const cookieToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value?.trim();

  const token = authHeader || queryToken || cookieToken;

  if (!token) {
    return NextResponse.json({ user: null });
  }

  const user = await fetchRaindropUser(token);

  if (!user) {
    const response = NextResponse.json({ user: null });
    // Token is no longer valid, clear cookie
    response.cookies.set(ACCESS_TOKEN_COOKIE, "", getAuthCookieOptions(0));
    return response;
  }

  return NextResponse.json({ user, token });
}
