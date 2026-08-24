import type { ElectrobunConfig } from "electrobun/bun";

export default {
  app: {
    name: "Synctable",
    identifier: "com.synctable.app",
    version: "0.1.0",
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
      "src/native/bin/dia-db-reader": "bin/dia-db-reader",
      "src/native/bin/sync-lifecycle-monitor": "bin/sync-lifecycle-monitor",
    },
    mac: {
      defaultRenderer: "native",
      icons: "icon.iconset",
    },
    linux: {
      icon: "../../docs/logo.png",
    },
    win: {
      icon: "../../docs/logo.png",
    },
  },
} satisfies ElectrobunConfig;

