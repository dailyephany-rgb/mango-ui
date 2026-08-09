import React from "react";
import SafeDateInput from "./SafeDateInput.jsx";

const SOURCE_OPTIONS = ["OPD", "IPD", "Third Floor", "All"];

/**
 * Shared register filter bar UI.
 * Optional class overrides preserve Inside Lab markup differences.
 */
export default function RegisterFilterBar({
  regSearch,
  setRegSearch,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  sourceFilter,
  setSourceFilter,
  sourceContainerClassName = "source-buttons",
  useDateLabelSpan = false,
  sourceButtonClassName,
}) {
  const renderSourceClass = (src) => {
    if (sourceButtonClassName) {
      return sourceButtonClassName(src, sourceFilter);
    }
    return sourceFilter === src ? "source-btn active" : "source-btn";
  };

  return (
    <div className="filter-bar">
      <input
        className="reg-search"
        placeholder="Search Reg or Diag No..."
        value={regSearch}
        onChange={(e) => setRegSearch(e.target.value)}
      />
      <div className="date-filters">
        {useDateLabelSpan ? (
          <span className="date-label">Date:</span>
        ) : (
          <label>Date:</label>
        )}
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
      </div>
      <div className={sourceContainerClassName}>
        {SOURCE_OPTIONS.map((src) => (
          <button
            key={src}
            className={renderSourceClass(src)}
            onClick={() => setSourceFilter(src)}
          >
            {src}
          </button>
        ))}
      </div>
    </div>
  );
}
