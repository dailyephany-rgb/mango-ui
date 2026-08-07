/**
 * Observer-only component boundary for Engineering Component Timeline.
 * When telemetry is off, still renders children; probes no-op.
 * Never awaits; never throws into clinical tree.
 */

import React, { Profiler, useEffect, useRef } from "react";
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
  const started = useRef(false);

  useEffect(() => {
    if (!isEngTelemetryEnabled() || !name) return undefined;
    started.current = true;
    EngTelemetry.componentMount({ name, type, parent, moduleId });
    return () => {
      EngTelemetry.componentUnmount(name);
    };
  }, [name, type, parent, moduleId]);

  const onRender = (id, phase, actualDuration) => {
    try {
      if (!isEngTelemetryEnabled()) return;
      EngTelemetry.componentRender(name, actualDuration, phase);
    } catch {
      /* ignore */
    }
  };

  // Profiler always wraps so hook order is stable; callback no-ops when off.
  return (
    <Profiler id={name || "eng-comp"} onRender={onRender}>
      {children}
    </Profiler>
  );
}

export default EngComponent;
