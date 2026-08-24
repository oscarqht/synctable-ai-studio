import React from "react";
import { createRoot } from "react-dom/client";
import { Electroview } from "electrobun/view";
import type { SynctableRPCSchema } from "../shared/types";
import { App } from "./App";

const rpc = Electroview.defineRPC<SynctableRPCSchema>({
  handlers: {
    requests: {},
    messages: {
      syncComplete: (result) => {
        window.dispatchEvent(
          new CustomEvent("synctable:syncComplete", { detail: result })
        );
      },
    },
  },
});

new Electroview({ rpc });

function init() {
  const rootElement = document.getElementById("root");
  if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<App rpc={rpc} />);
  } else {
    console.error("Failed to find root element #root");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

