/**
 * Shared EngComponent section wrappers for Owner analytics pages.
 * Keeps Catalog names stable: Filters / KPIs / Charts / Delays / Staff Analytics.
 */

import React, { useEffect, useState } from "react";
import { EngComponent } from "../../engineering/ui/EngComponent.jsx";
import { EngTelemetry } from "../../engineering/telemetry/EngTelemetry.js";

/** Pin Timeline/Departments identity to Owner for all owner_* pages. */
export function useOwnerEngContext(page) {
  useEffect(() => {
    EngTelemetry.setContext({
      page,
      department: "Owner",
    });
  }, [page]);
}

export function OwnerPageShell({ page, moduleId, children }) {
  useOwnerEngContext(page);
  return (
    <EngComponent
      name={page}
      type="Page"
      parent={null}
      moduleId={moduleId || page}
    >
      {children}
    </EngComponent>
  );
}

export function OwnerFilters({ page, children }) {
  return (
    <EngComponent name="Filters" type="Layout" parent={page}>
      {children}
    </EngComponent>
  );
}

export function OwnerKPIs({ page, children, hidden = false }) {
  return (
    <EngComponent name="KPIs" type="Charts" parent={page}>
      <div
        style={hidden ? { display: "none" } : undefined}
        aria-hidden={hidden || undefined}
      >
        {children}
      </div>
    </EngComponent>
  );
}

/** Keep tab Eng panels mounted after first open — hide inactive instead of unmounting. */
export function useVisitedTabs(activeTab, initialTab = "overview") {
  const [visited, setVisited] = useState(() => ({ [initialTab]: true }));
  useEffect(() => {
    setVisited((v) => (v[activeTab] ? v : { ...v, [activeTab]: true }));
  }, [activeTab]);
  return visited;
}

export function OwnerTabPanel({ active, children }) {
  return (
    <div
      style={{ display: active ? undefined : "none" }}
      aria-hidden={!active || undefined}
    >
      {children}
    </div>
  );
}

export function OwnerCharts({ page, children }) {
  return (
    <EngComponent name="Charts" type="Charts" parent={page}>
      {children}
    </EngComponent>
  );
}

export function OwnerDelays({ page, children }) {
  return (
    <EngComponent name="Delays" type="Charts" parent={page}>
      {children}
    </EngComponent>
  );
}

export function OwnerStaff({ page, children }) {
  return (
    <EngComponent name="Staff Analytics" type="Charts" parent={page}>
      {children}
    </EngComponent>
  );
}
