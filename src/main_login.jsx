
import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import LoginPage from "./auth/LoginPage";

mountEngApp(document.getElementById("root"),
  <LoginPage />
);
