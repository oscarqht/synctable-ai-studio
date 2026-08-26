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
  const isError = updateInfo.status === "error";

  let actionButtonLabel = "Install & Relaunch";
  let actionIcon = "restart_alt";

  if (installing) {
    actionButtonLabel = "Relaunching...";
    actionIcon = "sync";
  } else if (isDownloading) {
    actionButtonLabel = "Downloading...";
    actionIcon = "progress_activity";
  } else if (updateInfo.status === "available") {
    actionButtonLabel = "Download & Install";
    actionIcon = "download";
  } else if (isError) {
    actionButtonLabel = "Retry";
    actionIcon = "refresh";
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 w-[420px] max-w-[calc(100vw-3rem)] bg-surface-container-lowest dark:bg-surface-container-high border border-outline-variant/80 rounded-2xl shadow-2xl p-6 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-5 duration-200 text-left select-none"
    >
      {/* Top row: Icon + Title + Version + Close */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary-container/40 dark:bg-primary-container/20 text-primary flex items-center justify-center shrink-0 border border-primary/20">
            <span className="material-symbols-outlined text-[22px]">
              {isDownloading ? "downloading" : isError ? "error" : "rocket_launch"}
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-headline-lg text-[16px] font-bold text-on-surface leading-tight">
                {isError ? "Update Error" : isReady ? "Update Ready" : "Update Available"}
              </h4>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary text-on-primary shrink-0 leading-normal">
                v{updateInfo.version}
              </span>
            </div>
            <p className="text-[12px] text-on-surface-variant mt-0.5 truncate">
              {updateInfo.releaseName || `Synctable Desktop v${updateInfo.version}`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors shrink-0 -mr-1.5 -mt-1.5 cursor-pointer"
          title="Dismiss"
          aria-label="Dismiss notification"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      {/* Description / Release message */}
      <div className="mt-3.5 pl-[54px]">
        {isError ? (
          <p className="text-[13px] text-red-500 dark:text-red-400 leading-relaxed">
            {updateInfo.errorMessage || "Failed to download update. Please try again."}
          </p>
        ) : (
          <p className="text-[13px] text-on-surface-variant leading-relaxed line-clamp-2">
            {updateInfo.releaseNotes && updateInfo.releaseNotes.trim()
              ? updateInfo.releaseNotes.split("\n")[0]
              : isReady
              ? `Synctable Desktop v${updateInfo.version} is ready to install.`
              : `Synctable Desktop v${updateInfo.version} is available.`}
          </p>
        )}

        {isDownloading && (
          <div className="mt-3 flex items-center gap-2 text-[12px] text-primary font-medium bg-primary/10 px-3 py-1.5 rounded-lg">
            <span className="material-symbols-outlined text-[16px] animate-spin">
              progress_activity
            </span>
            <span>Downloading update in background...</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-4 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onDismiss}
            className="px-4 py-2 rounded-full border border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container font-label-md text-[13px] font-medium transition-colors cursor-pointer"
          >
            Dismiss
          </button>

          <button
            type="button"
            onClick={onInstall}
            disabled={installing || isDownloading}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-primary text-on-primary hover:bg-surface-tint font-label-md text-[13px] font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
          >
            <span className={`material-symbols-outlined text-[16px] ${installing || isDownloading ? "animate-spin" : ""}`}>
              {actionIcon}
            </span>
            <span>{actionButtonLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
