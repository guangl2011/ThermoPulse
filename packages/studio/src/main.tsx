import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles/studio.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Studio bootstrap failed: #root element not found in index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
