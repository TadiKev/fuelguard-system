// src/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import AuthProvider from "./auth/AuthProvider";
import "./index.css"; // your tailwind/base css (if any)

const container = document.getElementById("root");
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
