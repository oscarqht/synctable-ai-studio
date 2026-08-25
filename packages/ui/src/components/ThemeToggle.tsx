"use client";

import React, { useState, useRef, useEffect } from "react";
import { useTheme, type ThemeMode } from "../hooks/useTheme";

export interface ThemeToggleProps {
  variant?: "segmented" | "dropdown" | "button" | "cards";
  className?: string;
  showLabels?: boolean;
}

export function ThemeToggle({
  variant = "button",
  className = "",
  showLabels = false,
}: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme, toggleTheme, mounted } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getThemeIcon = (mode: ThemeMode) => {
    switch (mode) {
      case "light":
        return "light_mode";
      case "dark":
        return "dark_mode";
      case "system":
      default:
        return "brightness_auto";
    }
  };

  const getThemeLabel = (mode: ThemeMode) => {
    switch (mode) {
      case "light":
        return "Light";
      case "dark":
        return "Dark";
      case "system":
      default:
        return "Auto (System)";
    }
  };

  // 1. Cards Variant (for Settings Dialog)
  if (variant === "cards") {
    const options: Array<{
      mode: ThemeMode;
      label: string;
      description: string;
      icon: string;
    }> = [
      {
        mode: "system",
        label: "Auto (OS Theme)",
        description: "Automatically matches your operating system appearance.",
        icon: "brightness_auto",
      },
      {
        mode: "light",
        label: "Light Theme",
        description: "High-contrast clean light appearance with soft neutrals.",
        icon: "light_mode",
      },
      {
        mode: "dark",
        label: "Dark Theme",
        description: "Deep neutral twilight dark appearance that is easy on the eyes.",
        icon: "dark_mode",
      },
    ];

    return (
      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${className}`}>
        {options.map((opt) => {
          const isSelected = theme === opt.mode;
          return (
            <button
              key={opt.mode}
              type="button"
              onClick={() => setTheme(opt.mode)}
              className={`flex flex-col text-left p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                isSelected
                  ? "border-primary bg-primary-container/20 ring-1 ring-primary shadow-xs"
                  : "border-outline-variant/60 bg-surface-container hover:bg-surface-container-high hover:border-outline-variant"
              }`}
            >
              <div className="flex items-center justify-between w-full mb-2">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isSelected
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container-high text-on-surface-variant"
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {opt.icon}
                  </span>
                </div>
                {isSelected && (
                  <span className="material-symbols-outlined text-primary text-[18px]">
                    check_circle
                  </span>
                )}
              </div>
              <span className="font-label-md text-label-md font-bold text-on-surface mb-1">
                {opt.label}
              </span>
              <p className="font-body-sm text-[12px] leading-tight text-on-surface-variant">
                {opt.description}
              </p>
            </button>
          );
        })}
      </div>
    );
  }

  // 2. Segmented Pill Variant
  if (variant === "segmented") {
    const modes: ThemeMode[] = ["system", "light", "dark"];

    return (
      <div
        className={`flex items-center p-0.5 rounded-full bg-surface-container border border-outline-variant/60 select-none ${className}`}
      >
        {modes.map((mode) => {
          const isSelected = theme === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setTheme(mode)}
              title={getThemeLabel(mode)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-label-md text-label-md transition-all cursor-pointer ${
                isSelected
                  ? "bg-surface text-on-surface font-bold shadow-2xs"
                  : "text-on-surface-variant hover:text-on-surface font-normal"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {getThemeIcon(mode)}
              </span>
              {showLabels && <span>{mode === "system" ? "Auto" : getThemeLabel(mode)}</span>}
            </button>
          );
        })}
      </div>
    );
  }

  // 3. Dropdown Variant
  if (variant === "dropdown") {
    const modes: ThemeMode[] = ["system", "light", "dark"];

    return (
      <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant bg-surface hover:bg-surface-container-low text-on-surface font-label-md text-label-md transition-colors cursor-pointer"
          title={`Appearance: ${getThemeLabel(theme)}`}
        >
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
            {theme === "system"
              ? "brightness_auto"
              : resolvedTheme === "dark"
              ? "dark_mode"
              : "light_mode"}
          </span>
          <span className="hidden sm:inline">{getThemeLabel(theme)}</span>
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
            expand_more
          </span>
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-1.5 w-44 rounded-xl bg-surface-container-lowest border border-surface-variant shadow-lg py-1.5 z-50 animate-in fade-in-50 zoom-in-95">
            {modes.map((mode) => {
              const isSelected = theme === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setTheme(mode);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2 text-left text-sm transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-surface-container text-primary font-bold"
                      : "text-on-surface hover:bg-surface-container-low"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">
                      {getThemeIcon(mode)}
                    </span>
                    <span>{getThemeLabel(mode)}</span>
                  </div>
                  {isSelected && (
                    <span className="material-symbols-outlined text-[16px]">
                      check
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // 4. Default Button / Cycle Variant
  const currentIcon = !mounted
    ? "brightness_auto"
    : theme === "system"
    ? "brightness_auto"
    : resolvedTheme === "dark"
    ? "dark_mode"
    : "light_mode";

  const nextModeDescription =
    theme === "system"
      ? "Switch to Light Theme"
      : theme === "light"
      ? "Switch to Dark Theme"
      : "Switch to Auto Theme (Match OS)";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`w-9 h-9 min-[1080px]:w-auto min-[1080px]:h-9 min-[1080px]:px-3 rounded-full flex items-center justify-center gap-1.5 border border-outline-variant bg-surface hover:bg-surface-container-low text-on-surface font-label-md text-label-md transition-colors cursor-pointer select-none ${className}`}
      title={`Current: ${getThemeLabel(theme)} (${nextModeDescription})`}
      aria-label={`Toggle theme. Currently ${getThemeLabel(theme)}`}
    >
      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
        {currentIcon}
      </span>
      {showLabels && (
        <span className="hidden min-[1080px]:inline text-xs font-semibold">
          {theme === "system" ? "Auto" : getThemeLabel(theme)}
        </span>
      )}
    </button>
  );
}
