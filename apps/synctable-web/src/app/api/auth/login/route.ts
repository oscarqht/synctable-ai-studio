import { NextRequest, NextResponse } from "next/server";
import { getAuthorizationUrl, STATE_COOKIE, getAuthCookieOptions } from "@/lib/raindrop";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  const payloadObj = { id: crypto.randomUUID(), origin };
  const payloadStr = JSON.stringify(payloadObj);
  const payloadB64 = Buffer.from(payloadStr).toString("base64url");

  const secret = process.env.RAINDROP_CLIENT_SECRET || "";
  let state;
  if (secret) {
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(payloadStr);
    const signature = hmac.digest("base64url");
    state = `${payloadB64}.${signature}`;
  } else {
    // Fallback if no secret is set (though it should be for OAuth)
    state = crypto.randomUUID();
  }

  const authUrl = getAuthorizationUrl(state);

  const response = NextResponse.redirect(authUrl);

  response.cookies.set(STATE_COOKIE, state, getAuthCookieOptions(60 * 10));

  return response;
}
