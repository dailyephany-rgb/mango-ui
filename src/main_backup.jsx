
import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import BackupEntry from "./backup/BackupEntry.jsx"; // Adjust the path based on your folder structure

mountEngApp(document.getElementById("root"),
  <BackupEntry />
);
