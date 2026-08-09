
import React, { useState, Suspense, lazy, useEffect } from "react";
import "./Backroom.css";

import UserMenu from "../auth/UserMenu";
import { EngComponent } from "../engineering/ui/EngComponent.jsx";
import { EngTelemetry } from "../engineering/telemetry/EngTelemetry.js";

const ESRRegister = lazy(() => import("./ESRRegister.jsx"));
const BloodGroupRegister = lazy(() => import("./BloodGroupRegister.jsx"));
const SerologyRegister = lazy(() => import("./SerologyRegister.jsx"));
const RapidCardRegister = lazy(() => import("./RapidCardRegister.jsx"));
const UrineAnalysisRegister = lazy(() => import("./UrineAnalysisRegister.jsx"));
const BackroomInventoryTab = lazy(() =>
  import("../inventory/BackroomInventoryTab.jsx")
);

function TabPanel({ name, children }) {
  // Suspense MUST be inside EngComponent. If EngComponent is inside Suspense,
  // lazy chunk load unmounts the boundary → mount/unmount churn + Timeline thrash.
  return (
    <EngComponent name={name} type="Tables" parent="Backroom.jsx">
      <Suspense fallback={<p>Loading…</p>}>{children}</Suspense>
    </EngComponent>
  );
}

export default function BackroomMain() {
  const [activeTab, setActiveTab] = useState("esr");

  useEffect(() => {
    EngTelemetry.setContext({
      page: "Backroom",
      department: "Backroom",
    });
  }, []);

  const renderActiveTab = () => {
    switch (activeTab) {
      case "esr":
        return (
          <TabPanel name="ESR">
            <ESRRegister />
          </TabPanel>
        );
      case "blood":
        return (
          <TabPanel name="Blood Group">
            <BloodGroupRegister />
          </TabPanel>
        );
      case "serology":
        return (
          <TabPanel name="Serology">
            <SerologyRegister />
          </TabPanel>
        );
      case "rapid":
        return (
          <TabPanel name="Rapid Card">
            <RapidCardRegister />
          </TabPanel>
        );
      case "urine":
        return (
          <TabPanel name="Urine">
            <UrineAnalysisRegister />
          </TabPanel>
        );
      case "inventory":
        return (
          <TabPanel name="Inventory Tab">
            <BackroomInventoryTab />
          </TabPanel>
        );
      default:
        return (
          <TabPanel name="ESR">
            <ESRRegister />
          </TabPanel>
        );
    }
  };

  return (
    <EngComponent name="Backroom.jsx" type="Page" parent={null}>
      <div className="backroom-container">
        <EngComponent name="Toolbar" type="Layout" parent="Backroom.jsx">
          <div
            className="header-bar"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h2>Backroom Registers Dashboard</h2>
            <UserMenu />
          </div>
        </EngComponent>

        <div className="tab-container">
          <button
            className={`tab-btn ${activeTab === "esr" ? "active" : ""}`}
            onClick={() => setActiveTab("esr")}
          >
            ESR Register
          </button>
          <button
            className={`tab-btn ${activeTab === "blood" ? "active" : ""}`}
            onClick={() => setActiveTab("blood")}
          >
            Blood Group & Rh Type
          </button>
          <button
            className={`tab-btn ${activeTab === "serology" ? "active" : ""}`}
            onClick={() => setActiveTab("serology")}
          >
            Serology Register
          </button>
          <button
            className={`tab-btn ${activeTab === "rapid" ? "active" : ""}`}
            onClick={() => setActiveTab("rapid")}
          >
            Rapid Card Register
          </button>
          <button
            className={`tab-btn ${activeTab === "urine" ? "active" : ""}`}
            onClick={() => setActiveTab("urine")}
          >
            Urine Analysis Register
          </button>
          <button
            className={`tab-btn ${activeTab === "inventory" ? "active" : ""}`}
            onClick={() => setActiveTab("inventory")}
          >
            Inventory
          </button>
        </div>

        <div className="register-content">{renderActiveTab()}</div>
      </div>
    </EngComponent>
  );
}
