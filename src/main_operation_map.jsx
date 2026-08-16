import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import OperationMapApp from "./operation_map/OperationMapApp.jsx";

mountEngApp(document.getElementById("root"), <OperationMapApp />);
