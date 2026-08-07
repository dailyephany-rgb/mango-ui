/**
 * Engineering Operations Platform — Dashboard shell (EDS §13).
 * Data source: Engineering Firebase only.
 */

import React, { useState } from "react";
import { EngErrorBoundary } from "./EngErrorBoundary.jsx";
import EngOpsGate from "./EngOpsGate.jsx";
import { EngFilterProvider } from "./EngFilterContext.jsx";
import { GlobalFilterBar } from "./GlobalFilterBar.jsx";
import {
  HealthPage,
  DevicesPage,
  DepartmentsPage,
  FirestorePage,
  ListenersPage,
  MemoryPage,
  ReactMetricsPage,
  PerformancePage,
  NetworkPage,
  ErrorsPage,
  AuditPage,
  BuildsPage,
  SettingsPage,
} from "./pages.jsx";
import { TimelinePage } from "./TimelinePage.jsx";
import "./Engineering.css";

const NAV = [
  { id: "health", label: "Health", Page: HealthPage },
  { id: "devices", label: "Devices", Page: DevicesPage },
  { id: "departments", label: "Departments", Page: DepartmentsPage },
  { id: "firestore", label: "Firestore", Page: FirestorePage },
  { id: "listeners", label: "Listeners", Page: ListenersPage },
  { id: "memory", label: "Memory", Page: MemoryPage },
  { id: "react", label: "React", Page: ReactMetricsPage },
  { id: "performance", label: "Performance", Page: PerformancePage },
  { id: "timeline", label: "Timeline", Page: TimelinePage },
  { id: "network", label: "Network", Page: NetworkPage },
  { id: "errors", label: "Errors", Page: ErrorsPage },
  { id: "builds", label: "Builds", Page: BuildsPage },
  { id: "settings", label: "Settings", Page: SettingsPage },
  { id: "audit", label: "Audit", Page: AuditPage },
];

export default function EngineeringApp() {
  const [tab, setTab] = useState("health");
  const active = NAV.find((n) => n.id === tab) || NAV[0];
  const Page = active.Page;
  const showFilters = tab !== "settings";

  return (
    <EngErrorBoundary>
      <EngOpsGate>
        <EngFilterProvider>
          <div className="eng-app">
            <nav className="eng-nav" aria-label="Engineering sections">
              <div className="eng-brand">
                Mango Engineering
                <span>Operations · observer only</span>
              </div>
              {NAV.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={tab === n.id ? "active" : ""}
                  onClick={() => setTab(n.id)}
                >
                  {n.label}
                </button>
              ))}
            </nav>
            <main className="eng-main">
              {showFilters && <GlobalFilterBar />}
              <Page />
            </main>
          </div>
        </EngFilterProvider>
      </EngOpsGate>
    </EngErrorBoundary>
  );
}
