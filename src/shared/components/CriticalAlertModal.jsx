import React from "react";

/**
 * Shared critical-alert capture modal.
 * Presentational only — callers own open state, inputs, and save handler.
 * Supports editable input (analyzer depts) and read-only textarea (backroom).
 */
export default function CriticalAlertModal({
  open,
  parameterInput,
  setParameterInput,
  reportedByInput,
  setReportedByInput,
  onCancel,
  onSave,
  parameterPlaceholder = "e.g. K+: 7.2",
  parameterLabel = "Critical Parameter & Value",
  parameterAsTextarea = false,
  parameterReadOnly = false,
  parameterRows = 3,
  actionsClassName,
}) {
  if (!open) return null;

  return (
    <div className="critical-modal-overlay">
      <div className="critical-modal">
        <h3>Critical Alert</h3>

        <label>{parameterLabel}</label>

        {parameterAsTextarea ? (
          <textarea
            value={parameterInput}
            readOnly={parameterReadOnly}
            onChange={
              parameterReadOnly || !setParameterInput
                ? undefined
                : (e) => setParameterInput(e.target.value)
            }
            className="critical-params"
            rows={parameterRows}
            spellCheck={false}
          />
        ) : (
          <input
            type="text"
            value={parameterInput}
            onChange={(e) => setParameterInput(e.target.value)}
            placeholder={parameterPlaceholder}
          />
        )}

        <label style={{ marginTop: "15px" }}>
          Critical Reported By
        </label>

        <input
          type="text"
          value={reportedByInput}
          onChange={(e) => setReportedByInput(e.target.value)}
          placeholder="Enter Name"
        />

        <div
          className={actionsClassName}
          style={
            actionsClassName
              ? undefined
              : {
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  marginTop: "20px",
                }
          }
        >
          <button className="source-btn" onClick={onCancel}>
            Cancel
          </button>

          <button
            className="save-btn"
            style={{ width: "120px" }}
            onClick={onSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
