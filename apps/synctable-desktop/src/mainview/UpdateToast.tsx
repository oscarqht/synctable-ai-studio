import React from "react";
import type { UpdateInfo } from "../shared/types";

export interface UpdateToastProps {
  updateInfo: UpdateInfo | null;
  onInstall: () => void;
  onDismiss: () => void;
  installing?: boolean;
}

export function UpdateToast({
  updateInfo,
  onInstall,
  onDismiss,
  installing = false,
}: UpdateToastProps) {
  if (!updateInfo) return null;

  const isDownloading = updateInfo.status === "downloading";
  const isReady = updateInfo.status === "ready_to_install";

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-surface-container-high dark:bg-surface-dim border border-outline-variant/80 rounded-2xl shadow-2xl p-4.5 backdrop-blur-md animate-in fade-in slide-in-from-bottom-5 duration-200 text-left select-none"
    >
      <div className="flex items-start gap-3">
        {/* Update Icon badge */}
        <div className="w-9 h-9 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center shrink-0 shadow-xs">
          <span className="material-symbols-outlined text-[20px]">
            {isDownloading ? "downloading" : "rocket_launch"}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-title-sm text-title-sm font-bold text-on-surface truncate">
              Update Available
            </h4>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary text-on-primary shrink-0">
              v{updateInfo.version}
            </span>
          </div>

          <p className="mt-1 text-[13px] text-on-surface-variant line-clamp-2 leading-relaxed">
            {updateInfo.releaseName || `Synctable Desktop v${updateInfo.version}`} is ready to download and install.
          </p>

          {isDownloading && (
            <div className="mt-2.5 flex items-center gap-2 text-[12px] text-primary font-medium">
              <span className="material-symbols-outlined text-[16px] animate-spin">
                progress_activity
              </span>
              <span>Downloading update in background...</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-3.5 flex items-center gap-2">
            <button
              type="button"
              onClick={onInstall}
              disabled={installing || isDownloading}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-on-primary hover:bg-surface-tint font-label-md text-[13px] font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {installing ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">
                    sync
                  </span>
                  <span>Relaunching...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">
                    restart_alt
                  </span>
                  <span>Install &amp; Relaunch</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onDismiss}
              className="px-3 py-1.5 rounded-full border border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container font-label-md text-[13px] font-medium transition-colors cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={onDismiss}
          className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container transition-colors shrink-0 -mr-1 -mt-1"
          title="Dismiss"
          aria-label="Dismiss notification"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
    </div>
  );
}
