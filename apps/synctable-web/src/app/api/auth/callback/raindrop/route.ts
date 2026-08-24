import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  STATE_COOKIE,
  getAuthCookieOptions,
} from "@/lib/raindrop";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const baseUrl = new URL("/", request.url);

  if (error) {
    baseUrl.searchParams.set("error", errorDescription || error);
    return NextResponse.redirect(baseUrl);
  }

  if (!code) {
    baseUrl.searchParams.set("error", "No authorization code provided");
    return NextResponse.redirect(baseUrl);
  }

  // Cross-domain state redirection (for preview environments)
  if (state && state.includes(".")) {
    const [payloadB64, signature] = state.split(".");
    try {
      const payloadStr = Buffer.from(payloadB64, "base64url").toString("utf-8");
      const secret = process.env.RAINDROP_CLIENT_SECRET || "";
      if (secret) {
        const hmac = crypto.createHmac("sha256", secret);
        hmac.update(payloadStr);
        const expectedSignature = hmac.digest("base64url");

        const expectedBuf = Buffer.from(expectedSignature, 'utf8');
        const providedBuf = Buffer.from(signature, 'utf8');

        if (expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf)) {
          const payload = JSON.parse(payloadStr);
          if (payload.origin && payload.origin !== request.nextUrl.origin) {
            const redirectUrl = new URL(request.url);
            const targetOrigin = new URL(payload.origin);
            redirectUrl.host = targetOrigin.host;
            redirectUrl.protocol = targetOrigin.protocol;
            redirectUrl.port = targetOrigin.port;
            return NextResponse.redirect(redirectUrl);
          }
        }
      }
    } catch (e) {
      // ignore parsing errors, proceed as normal
    }
  }

  const savedState = request.cookies.get(STATE_COOKIE)?.value;
  if (savedState && state && savedState !== state) {
    baseUrl.searchParams.set("error", "Invalid state parameter (CSRF protection)");
    return NextResponse.redirect(baseUrl);
  }

  try {
    const tokenData = await exchangeCodeForTokens(code);

    const redirectResponse = NextResponse.redirect(new URL("/", request.url));

    const maxAge = tokenData.expires_in || 60 * 60 * 24 * 30; // 30 days fallback

    redirectResponse.cookies.set(
      ACCESS_TOKEN_COOKIE,
      tokenData.access_token,
      getAuthCookieOptions(maxAge)
    );

    if (tokenData.refresh_token) {
      redirectResponse.cookies.set(
        REFRESH_TOKEN_COOKIE,
        tokenData.refresh_token,
        getAuthCookieOptions(60 * 60 * 24 * 90)
      );
    }

    // Clear state cookie
    redirectResponse.cookies.set(STATE_COOKIE, "", getAuthCookieOptions(0));

    return redirectResponse;
  } catch (err: any) {
    baseUrl.searchParams.set(
      "error",
      err?.message || "Failed to exchange authorization code"
    );
    return NextResponse.redirect(baseUrl);
  }
}
