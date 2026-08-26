import React, { useState, useEffect } from "react";
import { ThemeToggle } from "@synctable/ui";
import type { UpdateCheckResult, UpdateInfo } from "../shared/types";

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedDeviceName: string;
  savedRaindropToken: string;
  currentVersion?: string;
  pendingUpdate?: UpdateInfo | null;
  onSave: (deviceName: string, raindropToken: string) => Promise<void> | void;
  onOpenExternal?: (url: string) => void;
  onCheckForUpdates?: () => Promise<UpdateCheckResult | void>;
  onInstallUpdate?: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  savedDeviceName,
  savedRaindropToken,
  currentVersion = "0.3.0",
  pendingUpdate,
  onSave,
  onOpenExternal,
  onCheckForUpdates,
  onInstallUpdate,
}: SettingsModalProps) {
  const [deviceName, setDeviceName] = useState(savedDeviceName);
  const [raindropToken, setRaindropToken] = useState(savedRaindropToken);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);

  // Update check states
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<"idle" | "up_to_date" | "available" | "error">("idle");
  const [updateMessage, setUpdateMessage] = useState<string>("");
  const [foundUpdateInfo, setFoundUpdateInfo] = useState<UpdateInfo | null>(pendingUpdate || null);

  useEffect(() => {
    if (isOpen) {
      setDeviceName(savedDeviceName);
      setRaindropToken(savedRaindropToken);
      setShowToken(false);
      setUpdateStatus(pendingUpdate ? "available" : "idle");
      setFoundUpdateInfo(pendingUpdate || null);
    }
  }, [isOpen, savedDeviceName, savedRaindropToken, pendingUpdate]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(deviceName.trim(), raindropToken.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleManualCheckUpdates = async () => {
    if (!onCheckForUpdates || checkingUpdate) return;
    setCheckingUpdate(true);
    setUpdateStatus("idle");
    setUpdateMessage("");

    try {
      const result = await onCheckForUpdates();
      if (result && typeof result === "object") {
        if (result.updateAvailable && result.updateInfo) {
          setUpdateStatus("available");
          setFoundUpdateInfo(result.updateInfo);
          setUpdateMessage(`Version v${result.latestVersion} is available!`);
        } else if (result.error) {
          setUpdateStatus("error");
          setUpdateMessage(result.error);
        } else {
          setUpdateStatus("up_to_date");
          setUpdateMessage(`You're up to date! (v${result.currentVersion || currentVersion})`);
        }
      }
    } catch (err: any) {
      setUpdateStatus("error");
      setUpdateMessage(err?.message || "Failed to check for updates");
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-surface-container-lowest rounded-2xl border border-surface-variant shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-variant">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">
              settings
            </span>
            <h2 className="font-title-md text-title-md font-bold text-on-surface">
              Synctable Preferences
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-left max-h-[80vh] overflow-y-auto zen-scrollbar">
          {/* Appearance & Theme Selector */}
          <div className="space-y-2">
            <label className="block font-label-md text-label-md font-bold text-on-surface flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                palette
              </span>
              <span>Appearance &amp; Theme</span>
            </label>
            <ThemeToggle variant="cards" />
          </div>

          {/* Device Name */}
          <div className="space-y-1.5">
            <label className="block font-label-md text-label-md font-bold text-on-surface flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                laptop_mac
              </span>
              <span>Device Name</span>
            </label>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="e.g. mbp @ office"
              className="w-full h-11 px-4 rounded-full bg-surface-container text-on-surface border-none focus:ring-2 focus:ring-primary-container font-body-sm placeholder:text-on-surface-variant"
            />
            <p className="font-body-sm text-[12px] text-on-surface-variant">
              Human-readable name identifying this device in the dashboard.
            </p>
          </div>

          {/* Raindrop Token */}
          <div className="space-y-1.5">
            <label className="block font-label-md text-label-md font-bold text-on-surface flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                key
              </span>
              <span>Raindrop.io API Test Token</span>
            </label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={raindropToken}
                onChange={(e) => setRaindropToken(e.target.value)}
                placeholder="Paste your test token from Raindrop Integrations"
                className="w-full h-11 pl-4 pr-11 rounded-full bg-surface-container text-on-surface border-none focus:ring-2 focus:ring-primary-container font-body-sm placeholder:text-on-surface-variant"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-1"
                title={showToken ? "Hide token" : "Show token"}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {showToken ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
            <p className="font-body-sm text-[12px] text-on-surface-variant">
              Get your token from{" "}
              <a
                href="https://app.raindrop.io/settings/integrations"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (onOpenExternal) {
                    e.preventDefault();
                    onOpenExternal("https://app.raindrop.io/settings/integrations");
                  }
                }}
                className="text-primary font-bold hover:underline"
              >
                Raindrop.io Settings → Integrations
              </a>
              . Securely stored using your operating system's credential protection.
            </p>
          </div>

          {/* Software Updates Section */}
          <div className="space-y-2 pt-2 border-t border-surface-variant">
            <label className="block font-label-md text-label-md font-bold text-on-surface flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                system_update
              </span>
              <span>Software Updates</span>
            </label>

            <div className="p-3.5 rounded-2xl bg-surface-container border border-outline-variant/60 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[13px] font-semibold text-on-surface">Synctable Desktop</span>
                  <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-bold bg-surface-container-high text-on-surface-variant">
                    v{currentVersion}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleManualCheckUpdates}
                  disabled={checkingUpdate}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-high hover:bg-surface-tint/20 border border-outline-variant text-on-surface text-[12px] font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <span className={`material-symbols-outlined text-[15px] ${checkingUpdate ? "animate-spin" : ""}`}>
                    {checkingUpdate ? "progress_activity" : "refresh"}
                  </span>
                  <span>{checkingUpdate ? "Checking..." : "Check for Updates"}</span>
                </button>
              </div>

              {/* Status messages */}
              {updateStatus === "up_to_date" && (
                <div className="flex items-center gap-1.5 text-[12px] text-emerald-600 dark:text-emerald-400 font-medium">
                  <span className="material-symbols-outlined text-[15px]">check_circle</span>
                  <span>{updateMessage}</span>
                </div>
              )}

              {updateStatus === "available" && foundUpdateInfo && (
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-primary-container/40 border border-primary/20">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-primary text-[18px] shrink-0">
                      rocket_launch
                    </span>
                    <div className="text-[12px] truncate">
                      <span className="font-bold text-on-surface">v{foundUpdateInfo.version} ready</span>
                    </div>
                  </div>
                  {onInstallUpdate && (
                    <button
                      type="button"
                      onClick={() => {
                        onInstallUpdate();
                        onClose();
                      }}
                      className="px-3 py-1 rounded-full bg-primary text-on-primary font-semibold text-[11px] hover:bg-surface-tint transition-colors cursor-pointer shrink-0"
                    >
                      Install &amp; Relaunch
                    </button>
                  )}
                </div>
              )}

              {updateStatus === "error" && (
                <div className="flex items-center gap-1.5 text-[12px] text-red-500 dark:text-red-400">
                  <span className="material-symbols-outlined text-[15px]">error</span>
                  <span className="truncate">{updateMessage}</span>
                </div>
              )}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-variant">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-full border border-outline-variant font-label-md text-label-md text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-6 py-2 rounded-full bg-primary text-on-primary hover:bg-surface-tint font-label-md text-label-md transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <span className={`material-symbols-outlined text-[16px] ${saving ? "animate-spin" : ""}`}>
                {saving ? "sync" : "save"}
              </span>
              <span>{saving ? "Saving..." : "Save Changes"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

