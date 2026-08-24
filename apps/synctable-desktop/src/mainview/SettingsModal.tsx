import React, { useState, useEffect } from "react";

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedDeviceName: string;
  savedRaindropToken: string;
  onSave: (deviceName: string, raindropToken: string) => Promise<void> | void;
  onOpenExternal?: (url: string) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  savedDeviceName,
  savedRaindropToken,
  onSave,
  onOpenExternal,
}: SettingsModalProps) {
  const [deviceName, setDeviceName] = useState(savedDeviceName);
  const [raindropToken, setRaindropToken] = useState(savedRaindropToken);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDeviceName(savedDeviceName);
      setRaindropToken(savedRaindropToken);
      setShowToken(false);
    }
  }, [isOpen, savedDeviceName, savedRaindropToken]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-surface-container-lowest rounded-lg border border-surface-variant shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
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
            className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-left">
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
              . Securely stored in macOS Keychain.
            </p>
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
