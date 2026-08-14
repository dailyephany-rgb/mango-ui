import React from "react";

/** ▼ button that toggles the column filter row (Master / Biochem pattern). */
export default function ColFilterToggle({
  open,
  active,
  onToggle,
  label = "Patient Name",
}) {
  return (
    <span className="th-with-filter">
      {label}
      <button
        type="button"
        className={`col-filter-toggle ${open ? "open" : ""} ${
          active ? "active" : ""
        }`}
        aria-label="Toggle column filters"
        aria-expanded={open}
        title="Column filters"
        onClick={onToggle}
      >
        ▼
      </button>
    </span>
  );
}

export function ColFilterInput({ value, onChange, placeholder }) {
  return (
    <th className="col-filter-cell">
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </th>
  );
}

export function ColFilterLocked() {
  return <th className="col-filter-cell col-filter-locked" />;
}

export function ColFilterClearCell({ show, onClear }) {
  return (
    <th className="col-filter-cell col-filter-actions">
      {show ? (
        <button type="button" className="col-filter-clear" onClick={onClear}>
          Clear
        </button>
      ) : null}
    </th>
  );
}
