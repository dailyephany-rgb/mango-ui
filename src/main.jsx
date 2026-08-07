// src/main.jsx
import React, { useState } from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import Mango from "./mango.jsx";
import MasterView_Table from "./master/MasterView_Table.jsx";
import MasterView_Rectangle from "./master_register_2/MasterView_Rectangle.jsx";
import { EngComponent } from "./engineering/ui/EngComponent.jsx";
import "./mango.css"; // Keep global styling consistent

function App() {
  const [activeView, setActiveView] = useState("mango");

  return (
    <div>
      {/* 🌟 Simple Top Navigation Bar */}
      <nav
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "20px",
          padding: "15px",
          backgroundColor: "#1e40af",
          color: "white",
          fontWeight: "600",
        }}
      >
        <button
          onClick={() => setActiveView("mango")}
          style={{
            background: activeView === "mango" ? "#2563eb" : "transparent",
            color: "white",
            border: "none",
            cursor: "pointer",
            fontSize: "16px",
          }}
        >
          🧾 Data Entry
        </button>

        <button
          onClick={() => setActiveView("table")}
          style={{
            background: activeView === "table" ? "#2563eb" : "transparent",
            color: "white",
            border: "none",
            cursor: "pointer",
            fontSize: "16px",
          }}
        >
          📊 Master Register (Table)
        </button>

        <button
          onClick={() => setActiveView("rectangle")}
          style={{
            background: activeView === "rectangle" ? "#2563eb" : "transparent",
            color: "white",
            border: "none",
            cursor: "pointer",
            fontSize: "16px",
          }}
        >
          📋 Master Register (Card)
        </button>
      </nav>

      {/* 🔄 Dynamic View Rendering — EngComponent is observer-only */}
      <div style={{ padding: "20px" }}>
        {activeView === "mango" && (
          <EngComponent name="Patient Entry" type="Forms" parent="Mango">
            <Mango />
          </EngComponent>
        )}
        {activeView === "table" && (
          <EngComponent
            name="MasterView_Table"
            type="Tables"
            parent="Mango"
          >
            <MasterView_Table />
          </EngComponent>
        )}
        {activeView === "rectangle" && (
          <EngComponent
            name="MasterView_Rectangle"
            type="Tables"
            parent="Mango"
          >
            <MasterView_Rectangle />
          </EngComponent>
        )}
      </div>
    </div>
  );
}

mountEngApp(document.getElementById("root"),
  <App />
);
