import React, { lazy, Suspense } from "react";

export const CountsBar = lazy(() => import("./CountsBar"));
export const StackedStageLines = lazy(() => import("./StackedStageLines"));
export const TimeBricks = lazy(() => import("./TimeBricks"));
export const DelayHistogram = lazy(() => import("./DelayHistogram"));
export const SLAScoreDonut = lazy(() => import("./SLAScoreDonut"));
export const StaffDistribution = lazy(() => import("./StaffDistribution"));
export const StaffAvgCards = lazy(() => import("./StaffAvgCards"));
export const StaffTimeline = lazy(() => import("./StaffTimeline"));

export const CountsBarOutsource = lazy(() => import("./CountsBarOutsource"));
export const StackedStageLinesOutsource = lazy(
  () => import("./StackedStageLinesOutsource")
);
export const TimeBricksOutsource = lazy(() => import("./TimeBricksOutsource"));

export const CountsBarInside = lazy(() => import("./CountsBarInside"));
export const StackedStageLinesInside = lazy(
  () => import("./StackedStageLinesInside")
);

export function OwnerChartsSection({ className = "owner-charts", style, children }) {
  return (
    <Suspense fallback={null}>
      <section className={className} style={style}>{children}</section>
    </Suspense>
  );
}
