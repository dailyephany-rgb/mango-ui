/**
 * Observer-only component boundary for Engineering Component Timeline.
 * When telemetry is off, still renders children; probes no-op.
 * Never awaits; never throws into clinical tree.
 *
 * Timing source of truth in production: useLayoutEffect elapsed time.
 * React.Profiler onRender is a no-op in normal production builds — do not
 * rely on it alone (that left Mount/Render as "—" / status "mounting").
 */

import React, { Profiler, useLayoutEffect, useRef } from "react";
import { isEngTelemetryEnabled } from "../telemetry/killSwitch.js";
import { EngTelemetry } from "../telemetry/EngTelemetry.js";

/**
 * @param {{
 *   name: string,
 *   type?: string,
 *   parent?: string | null,
 *   moduleId?: string | null,
 *   children: React.ReactNode,
 * }} props
 */
export function EngComponent({
  name,
  type = "Layout",
  parent = null,
  moduleId = null,
  children,
}) {
  const t0Ref = useRef(null);
  const nameRef = useRef(name);
  if (t0Ref.current == null || nameRef.current !== name) {
    nameRef.current = name;
    t0Ref.current = performance.now();
  }

  useLayoutEffect(() => {
    if (!isEngTelemetryEnabled() || !name) return undefined;
    const mountMs = Math.max(0, performance.now() - (t0Ref.current || performance.now()));
    EngTelemetry.componentMount({
      name,
      type,
      parent,
      moduleId,
      mountMs,
    });
    return () => {
      EngTelemetry.componentUnmount(name);
    };
  }, [name, type, parent, moduleId]);

  const onRender = (_id, phase, actualDuration) => {
    try {
      if (!isEngTelemetryEnabled()) return;
      // Dev / profiling builds only — refine with Profiler's commit duration.
      EngTelemetry.componentRender(name, actualDuration, phase);
    } catch {
      /* ignore */
    }
  };

  return (
    <Profiler id={name || "eng-comp"} onRender={onRender}>
      {children}
    </Profiler>
  );
}

export default EngComponent;
