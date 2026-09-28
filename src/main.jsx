import "./boot.js";
import "./storageShim.js";
import React from "react";
import { createRoot } from "react-dom/client";
import Momentum from "./Momentum.jsx";
import AppBoundary from "./components/AppBoundary.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppBoundary>
      <Momentum />
    </AppBoundary>
  </React.StrictMode>
);
