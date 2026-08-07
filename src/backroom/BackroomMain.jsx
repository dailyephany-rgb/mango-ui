
import React, { useState, Suspense, lazy } from "react";
import "./Backroom.css";

import UserMenu from "../auth/UserMenu";

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
        return <ESRRegister />;

      case "blood":
        return <BloodGroupRegister />;

      case "serology":
        return <SerologyRegister />;

      case "rapid":
        return <RapidCardRegister />;

      case "urine":
        return <UrineAnalysisRegister />;

      case "inventory":
        return <BackroomInventoryTab />;

      default:
        return <ESRRegister />;
    }
  };

  return (

    <div className="backroom-container">

      {/* Header */}
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
  );
}
