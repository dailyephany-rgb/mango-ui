/**
 * Shared EngComponent section wrappers for Owner analytics pages.
 * Keeps Catalog names stable: Filters / KPIs / Charts / Delays / Staff Analytics.
 */

import React, { useEffect } from "react";
import { EngComponent } from "../../engineering/ui/EngComponent.jsx";
import { EngTelemetry } from "../../engineering/telemetry/EngTelemetry.js";
import {
  useVisitedTabs,
  StickyTabPanel,
} from "../../shared/hooks/useVisitedTabs.jsx";

export { useVisitedTabs, StickyTabPanel as OwnerTabPanel };

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
