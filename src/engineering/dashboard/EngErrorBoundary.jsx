/**
 * React Error Boundary for Engineering Dashboard (and optional clinical roots).
 * On success: children unchanged. On error: record eng telemetry, show fallback.
 */

import React from "react";
import { EngTelemetry } from "../telemetry/EngTelemetry.js";
import { safeRun } from "../telemetry/safeRun.js";
import { sanitizeErrorPayload } from "../telemetry/redaction.js";

export class EngErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || String(error || "Unknown error"),
    };
  }

  componentDidCatch(error, info) {
    safeRun(() => {
      const clean = sanitizeErrorPayload({
        source: "react",
        message: error?.message || String(error),
        stack: `${error?.stack || ""}\n${info?.componentStack || ""}`,
        name: error?.name,
      });
      EngTelemetry.trackError(clean);
    }, "eng.boundary");
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <h2>Engineering UI error</h2>
          <p>{this.state.message}</p>
          <button type="button" onClick={() => this.setState({ hasError: false, message: "" })}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default EngErrorBoundary;
