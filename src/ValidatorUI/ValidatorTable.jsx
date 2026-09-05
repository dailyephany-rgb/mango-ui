import React, { useCallback, useEffect, useMemo, useState, memo } from "react";
import VirtualizedTableBody from "../shared/components/VirtualizedTableBody.jsx";
import { useStableCallback } from "../shared/hooks/useStableCallback.js";
import SafeDateInput from "../shared/components/SafeDateInput.jsx";

const COAG_RESULT_FIELDS = ["bt", "ct", "pt", "inr", "aptt"];
const BLOOD_GROUPS = ["A", "B", "AB", "O"];
const RH_FACTORS = ["Positive", "Negative"];

const RESULT_EDIT_TITLES = [
  "Coagulation",
  "Serology",
  "Urine",
  "Blood Group",
  "Rapid Card",
  "ESR",
];

function allowsResultEdit(title) {
  return RESULT_EDIT_TITLES.some((dept) => title.includes(dept));
}

function hasEditableResult(item) {
  if (item == null) return false;
  if (item.bloodGroup || item.rhFactor) return true;
  if (item.result != null && String(item.result).trim() !== "") return true;
  if (typeof item.results === "string" && item.results.trim()) return true;
  if (
    item.results &&
    typeof item.results === "object" &&
    Object.keys(item.results).length > 0
  ) {
    return true;
  }
  return COAG_RESULT_FIELDS.some(
    (f) => item[f] && String(item[f]).trim() && item[f] !== "MM:SS"
  );
}

const URINE_RESULT_FIELDS = [
  ["volume", "Volume"],
  ["color", "Color"],
  ["appearance", "Appearance"],
  ["sg", "SG"],
  ["ph", "pH"],
  ["albumin", "Protein"],
  ["sugar", "Glucose"],
  ["ketoneBodies", "Ketones"],
  ["rbc", "RBC"],
  ["pus", "Pus"],
  ["epithelium", "Epi"],
  ["crystals", "Crystals"],
  ["bacteria", "Bacteria"],
  ["casts", "Casts"],
  ["yeastCells", "Yeast"],
  ["others", "Others"],
];

function formatUrineRoutine(results = {}) {
  if (!results || typeof results !== "object") return "—";
  const parts = URINE_RESULT_FIELDS.map(([key, label]) => {
    const v = results[key];
    if (v == null || String(v).trim() === "" || String(v) === "—") return null;
    return `${label}: ${v}`;
  }).filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

function labelizeKey(key) {
  return String(key)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase());
}

function buildCoagResultsString(fields) {
  const parts = [];
  if (fields.bt && fields.bt !== "MM:SS") parts.push(`BT: ${fields.bt}`);
  if (fields.ct && fields.ct !== "MM:SS") parts.push(`CT: ${fields.ct}`);
  if (fields.pt) parts.push(`PT: ${fields.pt}`);
  if (fields.inr) parts.push(`INR: ${fields.inr}`);
  if (fields.aptt) parts.push(`APTT: ${fields.aptt}`);
  return parts.join(" | ");
}

function buildBloodResult(bloodGroup, rhFactor) {
  if (!bloodGroup || !rhFactor) return "";
  return `${bloodGroup} ${rhFactor === "Positive" ? "+" : "-"}`;
}

function initEditDraft(item, title = "") {
  if (!item) return { mode: "none", values: {} };

  const isBloodTitle = String(title).includes("Blood Group");
  const hasBloodFields =
    (item.bloodGroup != null && String(item.bloodGroup).trim() !== "") ||
    (item.rhFactor != null && String(item.rhFactor).trim() !== "");
  if (isBloodTitle || hasBloodFields) {
    return {
      mode: "blood",
      values: {
        bloodGroup: item.bloodGroup != null ? String(item.bloodGroup) : "",
        rhFactor: item.rhFactor != null ? String(item.rhFactor) : "",
      },
    };
  }

  const isCoagTitle = String(title).includes("Coagulation");
  const hasCoagFields = COAG_RESULT_FIELDS.some(
    (f) => item[f] != null && String(item[f]).trim() !== ""
  );
  if (isCoagTitle || hasCoagFields) {
    const values = {};
    for (const f of COAG_RESULT_FIELDS) {
      values[f] = item[f] != null ? String(item[f]) : "";
    }
    return { mode: "coag", values };
  }

  if (item.results && typeof item.results === "object") {
    const values = {};
    for (const [k, v] of Object.entries(item.results)) {
      values[k] = v == null ? "" : String(v);
    }
    return { mode: "object", values };
  }

  if (typeof item.results === "string") {
    return { mode: "resultsString", values: { text: item.results } };
  }

  const values = { text: item.result != null ? String(item.result) : "" };
  if (item.duration != null && String(item.duration).trim() !== "") {
    values.duration = String(item.duration);
  }
  return { mode: "resultString", values };
}

function draftToPayload(draft) {
  if (!draft || draft.mode === "none") return null;
  if (draft.mode === "blood") {
    const bloodGroup = draft.values.bloodGroup || "";
    const rhFactor = draft.values.rhFactor || "";
    return {
      bloodGroup,
      rhFactor,
      result: buildBloodResult(bloodGroup, rhFactor),
    };
  }
  if (draft.mode === "coag") {
    const fields = { ...draft.values };
    return {
      bt: fields.bt || "",
      ct: fields.ct || "",
      pt: fields.pt || "",
      inr: fields.inr || "",
      aptt: fields.aptt || "",
      results: buildCoagResultsString(fields),
    };
  }
  if (draft.mode === "object") {
    return { results: { ...draft.values } };
  }
  if (draft.mode === "resultsString") {
    return { results: draft.values.text || "" };
  }
  const payload = { result: draft.values.text || "" };
  if (Object.prototype.hasOwnProperty.call(draft.values, "duration")) {
    payload.duration = draft.values.duration || "";
  }
  return payload;
}

function ResultEditModal({ item, title, saving, onClose, onSave }) {
  const [draft, setDraft] = useState(() => initEditDraft(item, title));

  useEffect(() => {
    setDraft(initEditDraft(item, title));
  }, [item, title]);

  if (!item) return null;

  const setValue = (key, value) => {
    setDraft((prev) => ({
      ...prev,
      values: { ...prev.values, [key]: value },
    }));
  };

  const handleSave = () => {
    const payload = draftToPayload(draft);
    if (!payload) return;
    onSave(payload);
  };

  return (
    <div className="validator-edit-overlay" role="dialog" aria-modal="true">
      <div className="validator-edit-modal">
        <div className="validator-edit-header">
          <h3>Edit Results</h3>
          <button type="button" className="validator-edit-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="validator-edit-meta">
          {item.regNo || "—"} · {item.diagnosticNo || item.accessionNo || "—"} ·{" "}
          {item.name || "—"}
        </p>

        <div className="validator-edit-body">
          {draft.mode === "blood" && (
            <>
              <label className="validator-edit-field">
                <span>Blood Group</span>
                <select
                  value={draft.values.bloodGroup || ""}
                  onChange={(e) => setValue("bloodGroup", e.target.value)}
                >
                  <option value="">Select</option>
                  {BLOOD_GROUPS.map((bg) => (
                    <option key={bg} value={bg}>
                      {bg}
                    </option>
                  ))}
                </select>
              </label>
              <label className="validator-edit-field">
                <span>Rh Factor</span>
                <select
                  value={draft.values.rhFactor || ""}
                  onChange={(e) => setValue("rhFactor", e.target.value)}
                >
                  <option value="">Select</option>
                  {RH_FACTORS.map((rh) => (
                    <option key={rh} value={rh}>
                      {rh}
                    </option>
                  ))}
                </select>
              </label>
              <p className="validator-edit-preview">
                Result preview:{" "}
                <strong>
                  {buildBloodResult(
                    draft.values.bloodGroup,
                    draft.values.rhFactor
                  ) || "—"}
                </strong>
              </p>
            </>
          )}

          {draft.mode === "coag" &&
            COAG_RESULT_FIELDS.map((key) => (
              <label key={key} className="validator-edit-field">
                <span>{key.toUpperCase()}</span>
                <input
                  type="text"
                  value={draft.values[key] || ""}
                  onChange={(e) => setValue(key, e.target.value)}
                />
              </label>
            ))}

          {draft.mode === "object" &&
            Object.keys(draft.values).map((key) => (
              <label key={key} className="validator-edit-field">
                <span>{labelizeKey(key)}</span>
                <input
                  type="text"
                  value={draft.values[key] || ""}
                  onChange={(e) => setValue(key, e.target.value)}
                />
              </label>
            ))}

          {(draft.mode === "resultString" || draft.mode === "resultsString") && (
            <>
              <label className="validator-edit-field">
                <span>Result</span>
                <textarea
                  rows={4}
                  value={draft.values.text || ""}
                  onChange={(e) => setValue("text", e.target.value)}
                />
              </label>
              {Object.prototype.hasOwnProperty.call(draft.values, "duration") ? (
                <label className="validator-edit-field">
                  <span>Duration</span>
                  <input
                    type="text"
                    value={draft.values.duration || ""}
                    onChange={(e) => setValue("duration", e.target.value)}
                  />
                </label>
              ) : null}
            </>
          )}
        </div>

        <div className="validator-edit-actions">
          <button type="button" className="validator-edit-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="validator-edit-save"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

const ValidatorTableRow = memo(function ValidatorTableRow({
  item,
  index = 0,
  title,
  supportsCritical,
  shouldShowResult,
  canEditResult,
  isESR,
  loginMode,
  onValidate,
  onEditResult,
}) {
  const hasUrineRoutine = title.includes("Urine");

  const renderResult = (val) => {
    if (!val) return "—";
    if (typeof val !== "object") return String(val);
    return Object.entries(val)
      .filter(([_, value]) => value && value !== "")
      .map(([key, value]) => {
        const label = labelizeKey(key);
        return `${label}: ${value}`;
      })
      .join(" | ");
  };

  const editEnabled = canEditResult && hasEditableResult(item);

  return (
    <tr
      className={`${item.validated ? "row-validated" : "row-saved"}${
        index % 2 === 1 ? " row-stripe" : ""
      }`}
    >
      <td>{item.regNo || "—"}</td>
      <td>{item.diagnosticNo || item.accessionNo || "—"}</td>
      <td>{item.name || "—"}</td>
      <td>{item.source || "—"}</td>
      <td>
        {Array.isArray(item.selectedTests)
          ? item.selectedTests
              .map((t) =>
                typeof t === "string" ? t.toUpperCase() : t.name || t.test
              )
              .join(", ")
          : "—"}
      </td>
      <td style={{ fontWeight: "600", color: "#1e3a8a" }}>
        {item.savedBy || "—"}
      </td>
      <td style={{ fontWeight: "600", color: "#16a34a" }}>
        {item.validatedBy || "—"}
      </td>
      {supportsCritical && (
        <td style={{ textAlign: "center" }}>
          {item.critical === "Yes" && (
            <span
              style={{
                color: "red",
                fontWeight: "bold",
                fontSize: "10px",
                lineHeight: "1.4",
              }}
            >
              {" "}
              CRITICAL <br />
              REPORTED{" "}
            </span>
          )}
        </td>
      )}
      {shouldShowResult && (
        <td
          className="validator-result-cell"
          style={{ fontWeight: "bold", color: "#1e3a8a", fontSize: "13px" }}
        >
          {item.criticalParameter
            ? `CRITICAL: ${item.criticalParameter}`
            : hasUrineRoutine
            ? formatUrineRoutine(item.results)
            : renderResult(item.result || item.results)}
        </td>
      )}
      {isESR && (
        <td style={{ fontWeight: "600", color: "#dc2626" }}>
          {item.duration || "—"}
        </td>
      )}
      <td>
        {loginMode === "validator" ? (
          <button
            className={`validate-btn ${item.validated ? "validated" : ""}`}
            disabled={item.validated}
            onClick={() => !item.validated && onValidate(item)}
          >
            {item.validated ? "Validated" : "✅ Validate"}
          </button>
        ) : (
          <span style={{ color: item.validated ? "#16a34a" : "#9ca3af", fontWeight: 600 }}>
            {item.validated ? "Validated" : "Awaiting validation"}
          </span>
        )}
      </td>
      {canEditResult && (
        <td>
          <button
            type="button"
            className="edit-result-btn"
            disabled={!editEnabled}
            onClick={() => editEnabled && onEditResult(item)}
          >
            Edit
          </button>
        </td>
      )}
    </tr>
  );
}, (prev, next) => {
  if (prev.index !== next.index) return false;
  if (prev.title !== next.title) return false;
  if (prev.supportsCritical !== next.supportsCritical) return false;
  if (prev.shouldShowResult !== next.shouldShowResult) return false;
  if (prev.canEditResult !== next.canEditResult) return false;
  if (prev.isESR !== next.isESR) return false;
  if (prev.loginMode !== next.loginMode) return false;
  if (prev.onValidate !== next.onValidate) return false;
  if (prev.onEditResult !== next.onEditResult) return false;
  const a = prev.item;
  const b = next.item;
  return (
    a.id === b.id &&
    a.regNo === b.regNo &&
    a.diagnosticNo === b.diagnosticNo &&
    a.accessionNo === b.accessionNo &&
    a.name === b.name &&
    a.source === b.source &&
    a.savedBy === b.savedBy &&
    a.validatedBy === b.validatedBy &&
    a.validated === b.validated &&
    a.critical === b.critical &&
    a.criticalParameter === b.criticalParameter &&
    a.duration === b.duration &&
    a.result === b.result &&
    a.results === b.results &&
    a.bloodGroup === b.bloodGroup &&
    a.rhFactor === b.rhFactor &&
    a.bt === b.bt &&
    a.ct === b.ct &&
    a.pt === b.pt &&
    a.inr === b.inr &&
    a.aptt === b.aptt &&
    a.selectedTests === b.selectedTests
  );
});

export default function ValidatorTable({
  title,
  data,
  onValidate,
  onEditResult,
  searchTerm,
  setSearchTerm,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  loginMode
}) {
  const [sourceFilter, setSourceFilter] = useState("All");
  const [editingItem, setEditingItem] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  const departmentsWithResults = ["Coagulation", "Serology", "Urine", "Blood Group", "Rapid Card", "ESR", "Haematology"];
  const shouldShowResult = departmentsWithResults.some(dept => title.includes(dept));
  const canEditResult = allowsResultEdit(title);
  const isESR = title.includes("ESR");
  const supportsCritical =
  !title.includes("Blood Group");

  const finalColumnCount =
    7 +
    (supportsCritical ? 1 : 0) +
    (shouldShowResult ? 1 : 0) +
    (isESR ? 1 : 0) +
    1 + // Action
    (canEditResult ? 1 : 0);

  const finalData = useMemo(
    () =>
      (data || []).filter((item) => {
        if (sourceFilter !== "All" && item.source !== sourceFilter) return false;
        return true;
      }),
    [data, sourceFilter]
  );

  const stableValidate = useStableCallback((item) => onValidate(item));
  const stableOpenEdit = useStableCallback((item) => setEditingItem(item));

  const handleModalSave = async (payload) => {
    if (!editingItem || !onEditResult) return;
    try {
      setEditSaving(true);
      await onEditResult(editingItem, payload);
      setEditingItem(null);
    } finally {
      setEditSaving(false);
    }
  };

  const renderRow = useCallback(
    (item, index) => (
      <ValidatorTableRow
        key={item.id}
        item={item}
        index={index}
        title={title}
        supportsCritical={supportsCritical}
        shouldShowResult={shouldShowResult}
        canEditResult={canEditResult}
        isESR={isESR}
        loginMode={loginMode}
        onValidate={stableValidate}
        onEditResult={stableOpenEdit}
      />
    ),
    [
      title,
      supportsCritical,
      shouldShowResult,
      canEditResult,
      isESR,
      loginMode,
      stableValidate,
      stableOpenEdit,
    ]
  );

  return (
    <div className="validator-table-container">
      <div className="validator-table-title">{title}</div>

      <div className="validator-filter-bar">
        <input
          type="text"
          placeholder="Search Reg / Diag No..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <label>Date:</label>
        <SafeDateInput
          aria-label="Date from"
          value={dateFrom}
          onChange={setDateFrom}
        />
        <span>to</span>
        <SafeDateInput
          aria-label="Date to"
          value={dateTo}
          onChange={setDateTo}
        />

        <div className="source-buttons">
          {["OPD", "IPD", "Third Floor", "All"].map((src) => (
            <button key={src} className={sourceFilter === src ? "active" : ""} onClick={() => setSourceFilter(src)}>{src}</button>
          ))}
        </div>
      </div>

      <div className="validator-table-scroll">
        <table className="validator-table">
          <thead>
            <tr>
              <th>Reg No</th>
              <th>Diagnostic No</th>
              <th>Patient Name</th>
              <th>Source</th>
             
              <th>Tests</th>
              <th>Saved By</th>
              <th>Validated By</th>
              {supportsCritical && (<th>Critical</th>)}
              {shouldShowResult && (<th>Result</th>)}    
              {isESR && <th>Duration</th>}
              <th>Action</th>
              {canEditResult && <th>Edit</th>}
            </tr>
          </thead>
          {finalData.length > 0 ? (
            <VirtualizedTableBody
              items={finalData}
              columnCount={finalColumnCount}
              estimateRowHeight={48}
              scrollParentSelector=".validator-table-scroll, .table-wrapper, .haem-table-wrapper, .table-card, .dept-table-wrapper, .table-scroll-container"
              renderRow={renderRow}
            />
          ) : (
            <tbody>
              <tr>
                <td colSpan={finalColumnCount} className="no-entries">
                  No matching records found.
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>

      {editingItem ? (
        <ResultEditModal
          item={editingItem}
          title={title}
          saving={editSaving}
          onClose={() => !editSaving && setEditingItem(null)}
          onSave={handleModalSave}
        />
      ) : null}
    </div>
  );
}
