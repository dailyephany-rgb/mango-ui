
import React, { useState, Suspense, lazy } from "react";
import "./Backroom.css";

import UserMenu from "../auth/UserMenu";
import { EngComponent } from "../engineering/ui/EngComponent.jsx";

const ESRRegister = lazy(() => import("./ESRRegister.jsx"));
const BloodGroupRegister = lazy(() => import("./BloodGroupRegister.jsx"));
const SerologyRegister = lazy(() => import("./SerologyRegister.jsx"));
const RapidCardRegister = lazy(() => import("./RapidCardRegister.jsx"));
const UrineAnalysisRegister = lazy(() => import("./UrineAnalysisRegister.jsx"));
const BackroomInventoryTab = lazy(() =>
  import("../inventory/BackroomInventoryTab.jsx")
);

export default function BackroomMain() {

  const [activeTab, setActiveTab] = useState("esr");

  const renderActiveTab = () => {

    switch (activeTab) {

      case "esr":
        return (
          <EngComponent name="ESR" type="Tables" parent="Backroom.jsx">
            <ESRRegister />
          </EngComponent>
        );

      case "blood":
        return (
          <EngComponent name="Blood Group" type="Tables" parent="Backroom.jsx">
            <BloodGroupRegister />
          </EngComponent>
        );

      case "serology":
        return (
          <EngComponent name="Serology" type="Tables" parent="Backroom.jsx">
            <SerologyRegister />
          </EngComponent>
        );

      case "rapid":
        return (
          <EngComponent name="Rapid Card" type="Tables" parent="Backroom.jsx">
            <RapidCardRegister />
          </EngComponent>
        );

      case "urine":
        return (
          <EngComponent name="Urine" type="Tables" parent="Backroom.jsx">
            <UrineAnalysisRegister />
          </EngComponent>
        );

      case "inventory":
        return (
          <EngComponent name="Inventory Tab" type="Tables" parent="Backroom.jsx">
            <BackroomInventoryTab />
          </EngComponent>
        );

      default:
        return (
          <EngComponent name="ESR" type="Tables" parent="Backroom.jsx">
            <ESRRegister />
          </EngComponent>
        );
    }
  };

  return (
    <EngComponent name="Backroom.jsx" type="Page" parent={null}>
    <div className="backroom-container">

      {/* Header */}
      <EngComponent name="Toolbar" type="Layout" parent="Backroom.jsx">
          <div
          className="header-bar"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <h2>Backroom Registers Dashboard</h2>

          <UserMenu />
        </div>
      </EngComponent>

      {/* Tabs */}
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

      {/* Register Content */}
      <div className="register-content">
        <Suspense fallback={<p>Loading…</p>}>
          {renderActiveTab()}
        </Suspense>
      </div>

    </div>
    </EngComponent>
  );
}
