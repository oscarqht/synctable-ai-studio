"use client";

import React from "react";
import { Folder, FolderOpen } from "lucide-react";

export interface ZenFolderIconProps {
  isOpen?: boolean;
  className?: string;
  size?: number;
  color?: string | null;
}

export function ZenFolderIcon({
  isOpen = false,
  className = "",
  size = 22,
  color,
}: ZenFolderIconProps) {
  const Icon = isOpen ? FolderOpen : Folder;

  return (
    <div
      className={`inline-flex items-center justify-center relative shrink-0 ${
        color ? "" : "text-blue-500"
      } ${className}`}
      style={{
        width: size,
        height: size,
        color: color || undefined,
      }}
    >
      <Icon className="w-full h-full" aria-hidden="true" />
    </div>
  );
}
