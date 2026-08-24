"use client";

import React from "react";
import type { BrowserTreeNode } from "@/lib/types";

interface ZenWorkspaceBarProps {
  workspaces: BrowserTreeNode[];
  activeWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  isCompact?: boolean;
}

export function ZenWorkspaceBar({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  isCompact = false,
}: ZenWorkspaceBarProps) {
  if (workspaces.length === 0) return null;

  const activeSpace =
    workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];

  return (
    <div className="flex flex-col space-y-1.5 select-none">
      {/* Workspace Switcher Pills (when there are multiple workspaces) */}
      {workspaces.length > 1 && (
        <div className="flex items-center gap-1.5 px-1 py-1 mb-1 overflow-x-auto zen-scrollbar">
          {workspaces.map((space, idx) => {
            const isActive =
              space.id === activeWorkspaceId || (!activeWorkspaceId && idx === 0);
            return (
              <button
                key={space.id || idx}
                onClick={() => onSelectWorkspace(space.id)}
                title={`${space.title || `Workspace ${idx + 1}`}`}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150 active:scale-95 ${
                  isActive
                    ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs"
                    : "bg-slate-200/60 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-300/70"
                }`}
              >
                {space.title || `Workspace ${idx + 1}`}
              </button>
            );
          })}
        </div>
      )}

      {/* Clean Workspace Label (e.g. "Personal") */}
      {!isCompact && activeSpace && (
        <div className="px-3.5 pt-1 pb-1">
          <span className="text-xs sm:text-[13px] font-semibold text-slate-500/80 dark:text-slate-400/80 tracking-tight">
            {activeSpace.title || "Personal"}
          </span>
        </div>
      )}
    </div>
  );
}
