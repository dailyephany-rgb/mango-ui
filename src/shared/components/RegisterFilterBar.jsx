import React from "react";

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
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <span>to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
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
