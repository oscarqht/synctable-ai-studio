"use client";

import React, { useEffect, useState, useCallback } from "react";
import type {
  RaindropUserProfile,
  SynctableSyncResponse,
} from "@synctable/ui";
import { MultiDeviceCardsPortal } from "@synctable/ui";

export default function Home() {
  const [user, setUser] = useState<RaindropUserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);

  // Sync data state
  const [syncData, setSyncData] = useState<SynctableSyncResponse | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);

  const [tokenInput, setTokenInput] = useState<string>("");
  const [tokenLoading, setTokenLoading] = useState<boolean>(false);

  // Helper to get active token
  const getStoredToken = () => {
    try {
      return localStorage.getItem("synctable_raindrop_token") || "";
    } catch {
      return "";
    }
  };

  // Fetch Synctable Root Collection & Device Files
  const fetchSyncData = useCallback(async (overrideToken?: string) => {
    setSyncLoading(true);
    try {
      const activeToken = overrideToken || getStoredToken();
      const headers: Record<string, string> = {};
      if (activeToken) {
        headers["Authorization"] = `Bearer ${activeToken}`;
      }

      const res = await fetch("/api/sync/tree", { headers });
      if (res.ok) {
        const data = (await res.json()) as SynctableSyncResponse;
        setSyncData(data);
        setErrorMessage(null);
      } else {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setUser(null);
          try {
            localStorage.removeItem("synctable_raindrop_token");
          } catch {}
        }
        setErrorMessage(
          errorData.error || "Failed to load Synctable data from Raindrop."
        );
      }
    } catch (err: any) {
      console.error("Error fetching Synctable data:", err);
      setErrorMessage(err.message || "Failed to load Synctable data");
    } finally {
      setSyncLoading(false);
    }
  }, []);

  const handleTokenLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = tokenInput.replace(/^Bearer\s+/i, "").trim();
    if (!token) return;

    setTokenLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();
      if (res.ok && data.user) {
        try {
          localStorage.setItem("synctable_raindrop_token", token);
        } catch {}
        setUser(data.user);
        setAvatarError(false);
        // Immediately fetch sync data with verified token
        fetchSyncData(token);
      } else {
        setErrorMessage(data.error || "Failed to authenticate with token.");
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to authenticate with token.");
    } finally {
      setTokenLoading(false);
    }
  };

  // Load User Auth on Mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get("error");
    if (error) {
      setErrorMessage(error);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    async function checkAuth() {
      try {
        const activeToken = getStoredToken();
        const headers: Record<string, string> = {};
        if (activeToken) {
          headers["Authorization"] = `Bearer ${activeToken}`;
        }

        const res = await fetch("/api/auth/me", { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setUser(data.user);
            setAvatarError(false);
            if (data.token) {
              try {
                localStorage.setItem("synctable_raindrop_token", data.token);
              } catch {}
            }
          } else if (activeToken) {
            // Token was invalid
            try {
              localStorage.removeItem("synctable_raindrop_token");
            } catch {}
          }
        }
      } catch (err) {
        console.error("Failed to check auth status:", err);
      } finally {
        setAuthLoading(false);
      }
    }

    checkAuth();
  }, []);

  // Initial load and periodic auto-refresh every one minute
  useEffect(() => {
    if (!user) return;

    fetchSyncData();

    const AUTO_REFRESH_INTERVAL_MS = 60 * 1000;
    const intervalId = setInterval(() => {
      fetchSyncData();
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [user, fetchSyncData]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      try {
        localStorage.removeItem("synctable_raindrop_token");
      } catch {}
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      setSyncData(null);
    } catch (err) {
      console.error("Failed to logout:", err);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="bg-surface text-on-surface font-body-lg min-h-screen flex flex-col">
      {/* TopNavBar Component */}
      <header className="bg-surface dark:bg-surface-dim border-b border-outline-variant dark:border-outline sticky top-0 z-50">
        <div className="flex justify-between items-center w-full px-container-padding py-4 max-w-max-width mx-auto">
          {/* Brand Logo & Context */}
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-surface-container-high border border-outline-variant/60 flex items-center justify-center shadow-xs overflow-hidden select-none shrink-0">
              <img src="/logo.png" alt="Synctable" className="w-8 h-8 object-contain" />
            </div>
            <div>
              <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface dark:text-on-surface-variant">
                Synctable
              </h1>
              <p className="hidden md:block font-label-md text-label-md text-on-surface-variant">
                Cross-Browser Tab &amp; Workspace Sync
              </p>
            </div>
          </div>

          {/* Trailing Actions */}
          <div className="flex items-center gap-2 md:gap-4">
            {authLoading ? (
              <div className="flex items-center gap-2 text-on-surface-variant font-label-md text-label-md">
                <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
                <span className="hidden sm:inline">Checking session...</span>
              </div>
            ) : user ? (
              <>
                <button
                  onClick={() => fetchSyncData()}
                  disabled={syncLoading}
                  className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high transition-colors duration-200 cursor-pointer"
                  title="Sync status and refresh"
                >
                  <span
                    className={`material-symbols-outlined text-[20px] ${
                      syncLoading ? "animate-spin" : ""
                    }`}
                  >
                    sync
                  </span>
                  <span className="font-label-md text-label-md">Sync Status</span>
                </button>

                <div className="hidden md:flex items-center gap-3 px-4 py-1.5 rounded-full border border-outline-variant">
                  {user.avatarUrl && !avatarError ? (
                    <img
                      className="w-8 h-8 rounded-full object-cover"
                      src={user.avatarUrl}
                      alt={user.name}
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container font-bold text-xs flex items-center justify-center">
                      {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md font-bold truncate max-w-[120px]">
                      {user.name}
                    </span>
                    {user.email && (
                      <span className="text-[10px] text-on-surface-variant truncate max-w-[120px]">
                        {user.email}
                      </span>
                    )}
                  </div>
                  {user.isPro && (
                    <span className="px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container text-[10px] font-bold ml-2">
                      PRO
                    </span>
                  )}
                </div>

                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors duration-200 cursor-pointer"
                  title="Sign out of Raindrop"
                >
                  <span className="material-symbols-outlined">
                    {loggingOut ? "sync" : "logout"}
                  </span>
                </button>
              </>
            ) : (
              <a
                href="/api/auth/login"
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary text-on-primary hover:bg-surface-tint font-label-md text-label-md transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">login</span>
                <span>Connect Raindrop</span>
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="flex-1 w-full max-w-max-width mx-auto px-container-padding py-8 flex flex-col gap-10">
        {/* Error notification banner */}
        {errorMessage && (
          <div className="p-4 rounded-lg bg-error-container text-on-error-container flex items-start gap-3 text-sm shadow-xs">
            <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5">
              error
            </span>
            <div className="flex-1">
              <span className="font-bold">Notice:</span> {errorMessage}
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-xs font-bold underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {authLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-24 text-on-surface-variant space-y-3">
            <span className="material-symbols-outlined animate-spin text-4xl text-primary">
              sync
            </span>
            <p className="font-body-sm text-body-sm">Loading Synctable...</p>
          </div>
        ) : !user ? (
          /* BEFORE LOGIN: Landing & Raindrop Connect Card */
          <div className="flex-1 flex flex-col items-center justify-center py-12 px-4">
            <div className="w-full max-w-xl text-center space-y-8">
              <div className="flex flex-col items-center space-y-4">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-container border border-outline-variant font-label-md text-label-md text-on-surface-variant">
                  <span className="material-symbols-outlined text-[18px] text-primary">
                    auto_awesome
                  </span>
                  <span>Raindrop.io Cloud Sync Integration</span>
                </div>

                <div className="w-20 h-20 rounded-2xl bg-surface-container-high border border-outline-variant/60 flex items-center justify-center shadow-lg overflow-hidden">
                  <img src="/logo.png" alt="Synctable" className="w-14 h-14 object-contain" />
                </div>
              </div>

              <div className="space-y-3">
                <h1 className="font-display-lg text-display-lg font-bold text-on-surface tracking-tight">
                  Connect Your Raindrop Account
                </h1>
                <p className="font-body-lg text-body-lg text-on-surface-variant max-w-md mx-auto">
                  Sign in with Raindrop.io to inspect, manage, and synchronize
                  your workspaces, browser trees, and split tabs seamlessly.
                </p>
              </div>

              <div className="p-8 rounded-lg bg-surface-container-lowest border border-surface-variant shadow-sm space-y-6">
                <a
                  href="/api/auth/login"
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-full bg-primary hover:bg-surface-tint text-on-primary font-label-md text-label-md shadow-sm transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">login</span>
                  <span>Log in with Raindrop.io (OAuth)</span>
                </a>

                <div className="relative flex items-center justify-center">
                  <div className="border-t border-outline-variant/50 w-full"></div>
                  <span className="bg-surface-container-lowest px-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                    Or connect with API token
                  </span>
                </div>

                <form onSubmit={handleTokenLogin} className="space-y-4 text-left">
                  <div>
                    <label
                      htmlFor="raindrop-api-token"
                      className="block font-label-md text-label-md font-bold text-on-surface mb-1.5"
                    >
                      Raindrop.io Test Token
                    </label>
                    <input
                      id="raindrop-api-token"
                      type="password"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="Paste your test token here"
                      className="w-full h-12 px-4 rounded-full bg-surface-container text-on-surface border-none focus:ring-2 focus:ring-primary-container font-body-sm placeholder:text-on-surface-variant"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={tokenLoading || !tokenInput.trim()}
                    className="w-full flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-primary text-on-primary hover:bg-surface-tint disabled:opacity-50 font-label-md text-label-md transition-colors shadow-sm cursor-pointer"
                  >
                    <span className={`material-symbols-outlined text-[18px] ${tokenLoading ? "animate-spin" : ""}`}>
                      {tokenLoading ? "sync" : "key"}
                    </span>
                    <span>Connect with API Token</span>
                  </button>
                  <p className="font-label-md text-label-md text-on-surface-variant text-center">
                    Get your test token from{" "}
                    <a
                      href="https://app.raindrop.io/settings/integrations"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary font-bold hover:underline"
                    >
                      Raindrop.io Settings → Integrations
                    </a>
                  </p>
                </form>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left pt-2">
                <div className="p-4 rounded-lg bg-surface-container-lowest border border-surface-variant shadow-2xs flex flex-col space-y-1.5">
                  <div className="flex items-center gap-2 text-primary">
                    <span className="material-symbols-outlined text-[20px]">language</span>
                    <span className="font-label-md text-label-md font-bold text-on-surface">
                      Cross-Browser
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Sync tabs across Arc, Zen, Chrome, Firefox, Dia and more.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-surface-container-lowest border border-surface-variant shadow-2xs flex flex-col space-y-1.5">
                  <div className="flex items-center gap-2 text-primary">
                    <span className="material-symbols-outlined text-[20px]">layers</span>
                    <span className="font-label-md text-label-md font-bold text-on-surface">
                      Spaces & Splits
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Full hierarchy retention and workspace organisation.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-surface-container-lowest border border-surface-variant shadow-2xs flex flex-col space-y-1.5">
                  <div className="flex items-center gap-2 text-primary">
                    <span className="material-symbols-outlined text-[20px]">cloud_done</span>
                    <span className="font-label-md text-label-md font-bold text-on-surface">
                      Raindrop Cloud
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Decentralized, encrypted cloud sync via Raindrop API.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* AFTER LOGIN: Multi-Device Browser Tree Viewer */
          <MultiDeviceCardsPortal
            data={syncData}
            loading={syncLoading}
            onRefresh={fetchSyncData}
          />
        )}
      </main>
    </div>
  );
}

