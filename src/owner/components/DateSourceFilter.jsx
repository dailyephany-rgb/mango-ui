// src/owner/components/DateSourceFilter.jsx

import React, { useContext } from "react";
import { OwnerContext } from "../OwnerContext.jsx";
import SafeDateInput from "../../shared/components/SafeDateInput.jsx";

export default function DateSourceFilter() {
  const { dateRange, setDateRange, source, setSource } =
    useContext(OwnerContext);

  return (
    <div
      className="owner-filter-bar"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "20px",
        alignItems: "center",
        marginBottom: "20px",
      }}
    >
      {/* ---- DATE FROM ---- */}
      <div className="filter-item">
        <label>From</label>
        <SafeDateInput
          aria-label="From date"
          value={dateRange.from}
          onChange={(from) => setDateRange({ ...dateRange, from })}
        />
      </div>

      {/* ---- DATE TO ---- */}
      <div className="filter-item">
        <label>To</label>
        <SafeDateInput
          aria-label="To date"
          value={dateRange.to}
          onChange={(to) => setDateRange({ ...dateRange, to })}
        />
      </div>

      {/* ---- SOURCE ---- */}
      <div className="filter-item">
        <label>Source</label>
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="All">All</option>
          <option value="OPD">OPD</option>
          <option value="IPD">IPD</option>
          <option value="Third Floor">Third Floor</option>
        </select>
      </div>
    </div>
  );
}
