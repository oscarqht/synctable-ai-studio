export const RAINDROP_API_BASE = "https://api.raindrop.io/rest/v1";
export const RAINDROP_OAUTH_AUTH_URL = "https://raindrop.io/oauth/authorize";
export const RAINDROP_OAUTH_TOKEN_URL = "https://raindrop.io/oauth/access_token";

export const ACCESS_TOKEN_COOKIE = "raindrop_access_token";
export const REFRESH_TOKEN_COOKIE = "raindrop_refresh_token";
export const STATE_COOKIE = "raindrop_oauth_state";

export function getAuthCookieOptions(maxAge: number = 60 * 60 * 24 * 365) {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    path: "/",
    maxAge,
  };
}

export interface RaindropRawUser {
  _id: number;
  fullName: string;
  email?: string;
  email_MD5?: string;
  pro?: boolean;
  registered?: string;
  avatar?: string;
}

export interface RaindropUserProfile {
  id: number;
  name: string;
  email?: string;
  avatarUrl?: string;
  isPro?: boolean;
}

export interface RaindropTokenResponse {
  result?: boolean;
  access_token: string;
  refresh_token?: string;
  expires?: number;
  expires_in?: number;
  token_type?: string;
  error?: string;
  errorMessage?: string;
}

export function getRaindropTokenFromEnv(): string {
  return (
    process.env.RAINDROP_TOKEN?.trim() ||
    process.env.NEXT_PUBLIC_RAINDROP_TOKEN?.trim() ||
    ""
  );
}

export function getRaindropConfig() {
  const clientId =
    process.env.RAINDROP_CLIENT_ID ||
    process.env.NEXT_PUBLIC_RAINDROP_CLIENT_ID ||
    "";
  const clientSecret = process.env.RAINDROP_CLIENT_SECRET || "";
  const redirectUri =
    process.env.RAINDROP_REDIRECT_URI ||
    process.env.RAINDROP_CALLBACK_URL ||
    process.env.NEXT_PUBLIC_RAINDROP_CALLBACK_URL ||
    "http://localhost:3000/api/auth/callback/raindrop";
  const token = getRaindropTokenFromEnv();

  return {
    clientId,
    clientSecret,
    redirectUri,
    token,
  };
}

export function getAuthorizationUrl(state: string): string {
  const { clientId, redirectUri } = getRaindropConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  });

  return `${RAINDROP_OAUTH_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string
): Promise<RaindropTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getRaindropConfig();

  if (!clientId || !clientSecret) {
    throw new Error("Missing Raindrop client ID or client secret");
  }

  const res = await fetch(RAINDROP_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Failed to exchange token (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as RaindropTokenResponse;
  if (!data.access_token) {
    throw new Error(data.errorMessage || data.error || "No access token in response");
  }

  return data;
}

export async function fetchRaindropUser(
  token: string
): Promise<RaindropUserProfile | null> {
  const cleanToken = token.replace(/^Bearer\s+/i, "").trim();
  if (!cleanToken) return null;

  try {
    const res = await fetch(`${RAINDROP_API_BASE}/user`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.warn(`[Raindrop] /user returned ${res.status}: ${errorText}`);
      return null;
    }

    const data = (await res.json()) as {
      result?: boolean;
      user?: RaindropRawUser;
      item?: RaindropRawUser;
    };

    const user = data.user || data.item;
    if (!user) {
      return null;
    }

    const avatarUrl = user.email_MD5
      ? `https://www.gravatar.com/avatar/${user.email_MD5}?d=mp`
      : user.avatar;

    return {
      id: user._id || 1,
      name: user.fullName || user.email || "Raindrop User",
      email: user.email,
      avatarUrl,
      isPro: Boolean(user.pro),
    };
  } catch (err) {
    console.error("[Raindrop] Error fetching user profile:", err);
    return null;
  }
}

export const RAINDROP_COLLECTION_NAME = "Synctable";

export interface RaindropCollectionItem {
  _id: number;
  title: string;
  count?: number;
  parent?: { $id: number };
}

export interface RaindropItem {
  _id: number;
  title: string;
  excerpt?: string;
  link?: string;
  lastUpdate?: string;
  created?: string;
  file?: {
    name?: string;
    type?: string;
    size?: number;
  };
}

/**
 * Find the root collection named "Synctable" from user's collections.
 */
export async function findSynctableCollection(
  token: string
): Promise<RaindropCollectionItem | null> {
  // Fetch root collections
  const res = await fetch(`${RAINDROP_API_BASE}/collections`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(
      `Failed to list Raindrop collections (${res.status}): ${errorText}`
    );
  }

  const data = (await res.json()) as {
    result?: boolean;
    items?: RaindropCollectionItem[];
  };

  const collections = data.items || [];
  let synctable = collections.find(
    (c) =>
      c.title?.trim().toLowerCase() === RAINDROP_COLLECTION_NAME.toLowerCase()
  );

  if (synctable) {
    return synctable;
  }

  // Also check child collections if not in root
  try {
    const childRes = await fetch(`${RAINDROP_API_BASE}/collections/childrens`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (childRes.ok) {
      const childData = (await childRes.json()) as {
        result?: boolean;
        items?: RaindropCollectionItem[];
      };
      synctable = childData.items?.find(
        (c) =>
          c.title?.trim().toLowerCase() ===
          RAINDROP_COLLECTION_NAME.toLowerCase()
      );
      if (synctable) {
        return synctable;
      }
    }
  } catch (err) {
    // Non-critical, ignore
  }

  return null;
}

/**
 * Fetch all Raindrop items under the specified collection ID.
 */
export async function fetchCollectionRaindrops(
  token: string,
  collectionId: number
): Promise<RaindropItem[]> {
  const allItems: RaindropItem[] = [];
  let page = 0;
  const perpage = 50;

  while (true) {
    const res = await fetch(
      `${RAINDROP_API_BASE}/raindrops/${collectionId}?perpage=${perpage}&page=${page}&sort=-lastUpdate`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(
        `Failed to fetch raindrops in collection ${collectionId} (${res.status}): ${errorText}`
      );
    }

    const data = (await res.json()) as {
      result?: boolean;
      items?: RaindropItem[];
      count?: number;
    };

    const items = data.items || [];
    allItems.push(...items);

    if (items.length < perpage) {
      break;
    }
    page++;
    if (page > 10) break; // Safety limit
  }

  return allItems;
}

/**
 * Fetch file content of a Raindrop item.
 * Uses official Raindrop REST API endpoint: GET /rest/v1/raindrop/{id}/file
 */
export async function fetchRaindropFileContent(
  token: string,
  item: RaindropItem
): Promise<any | null> {
  const primaryApiUrl = `${RAINDROP_API_BASE}/raindrop/${item._id}/file`;

  // 1. Try primary endpoint with manual redirect so Authorization header isn't forwarded to S3
  try {
    const res = await fetch(primaryApiUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "Synctable-Web/1.0",
      },
      redirect: "manual",
      cache: "no-store",
    });

    if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
      const redirectUrl = res.headers.get("location");
      if (redirectUrl) {
        const fileRes = await fetch(redirectUrl, {
          method: "GET",
          cache: "no-store",
        });
        if (fileRes.ok) {
          const text = await fileRes.text();
          if (text && text.trim()) {
            return JSON.parse(text);
          }
        }
      }
    } else if (res.ok) {
      const text = await res.text();
      if (text && text.trim()) {
        return JSON.parse(text);
      }
    }
  } catch (err) {
    console.warn(`[Raindrop] Error fetching from ${primaryApiUrl}:`, err);
  }

  // 2. Fallback: try item.link without Authorization header
  if (item.link) {
    try {
      const res = await fetch(item.link, {
        method: "GET",
        cache: "no-store",
      });
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim()) {
          return JSON.parse(text);
        }
      }
    } catch (err) {
      console.warn(`[Raindrop] Error fetching from item.link ${item.link}:`, err);
    }
  }

  return null;
}




