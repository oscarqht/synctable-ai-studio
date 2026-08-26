import type { ElectrobunConfig } from "electrobun/bun";
import { platform } from "node:os";

const macNativeHelpers: Record<string, string> = platform() === "darwin"
  ? {
      "src/native/bin/dia-db-reader": "bin/dia-db-reader",
      "src/native/bin/sync-lifecycle-monitor": "bin/sync-lifecycle-monitor",
    }
  : {};

const winNativeHelpers: Record<string, string> = platform() === "win32"
  ? {
      "src/native/bin/win-file-reader.exe": "bin/win-file-reader.exe",
      "src/native/bin/win-live-reader.exe": "bin/win-live-reader.exe",
    }
  : {};


export default {
  app: {
    name: "Synctable",
    identifier: "com.synctable.app",
    version: "0.8.0",
    description: "Cross-browser tree backup and workspace synchronization utility",
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    views: {
      mainview: {
        entrypoint: "src/mainview/index.tsx",
      },
    },

    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "src/mainview/style.css": "views/mainview/style.css",
      "src/mainview/browser-arc.png": "views/mainview/browser-arc.png",
      "src/mainview/browser-chrome.png": "views/mainview/browser-chrome.png",
      "src/mainview/browser-dia.png": "views/mainview/browser-dia.png",
      "src/mainview/browser-firefox.png": "views/mainview/browser-firefox.png",
      "src/mainview/browser-vivaldi.png": "views/mainview/browser-vivaldi.png",
      "src/mainview/browser-zen.png": "views/mainview/browser-zen.png",
      "../../docs/poster.jpeg": "views/mainview/assets/poster.jpeg",
      "../../docs/logo.png": "views/mainview/assets/logo.png",
      ...macNativeHelpers,
      ...winNativeHelpers,
    },

    mac: {
      defaultRenderer: "native",
      icons: "icon.iconset",
    },
    linux: {
      icon: "../../docs/logo.png",
    },
    win: {
      icon: "icon.ico",
    },
  },
} satisfies ElectrobunConfig;

