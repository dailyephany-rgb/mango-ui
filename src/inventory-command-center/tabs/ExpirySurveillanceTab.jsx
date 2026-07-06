
import React, {useMemo,useState} from "react";

import EmergencyBadge
from "../components/EmergencyBadge";

import MetricCard
from "../components/MetricCard";

import DepartmentFilter
from "../components/DepartmentFilter";

import {
  calculateDaysLeft,
  getRiskLabel,
  filterExpiringInventory
} from "../utils/Expiryutils";



const ExpirySurveillanceTab = ({
  inventoryLogs
}) => {

  const [departmentFilter, setDepartmentFilter] =
    useState("All");

  const [searchTerm, setSearchTerm] =
    useState("");

  const [daysFilter, setDaysFilter] =
    useState(15);


  const expiryRows = useMemo(() => {

   
          let filtered =
        filterExpiringInventory(
          inventoryLogs,
          daysFilter
        );

    if (departmentFilter !== "All") {

      filtered = filtered.filter(item =>
        item.category === departmentFilter
      );

    }

    if (searchTerm.trim()) {

      filtered = filtered.filter(item =>
        item.reagentName
          ?.toLowerCase()
          .includes(
            searchTerm.toLowerCase()
          )
      );

    }

    return filtered
  .map(item => {

    const daysLeft =
  calculateDaysLeft(
    item.expiryDate
  );

    return {
      ...item,
      daysLeft
    };

  })
  .sort(
    (a, b) =>
      a.daysLeft - b.daysLeft
  );

  }, [
    inventoryLogs,
    departmentFilter,
    searchTerm,
    daysFilter
  ]);

  
  return (

    <div className="command-tab-container">

      {/* FILTERS */}

      <div className="command-filter-bar">

        <h2>Expiry Surveillance</h2>

        <input
          type="text"
          placeholder="Search reagent..."
          value={searchTerm}
          onChange={(e) =>
            setSearchTerm(e.target.value)
          }
        />

          <DepartmentFilter
            value={departmentFilter}
            onChange={setDepartmentFilter}
          />

        <select
          value={daysFilter}
          onChange={(e) =>
            setDaysFilter(
              Number(e.target.value)
            )
          }
        >

          <option value={7}>
            7 Days
          </option>

          <option value={15}>
            15 Days
          </option>

          <option value={30}>
            30 Days
          </option>

        </select>

      </div>

      {/* METRICS */}
      <div className="metric-cards-grid">

        <MetricCard
          label="Expiring Items"
          value={expiryRows.length}
        />

        <MetricCard
          label="Critical Expiry"
          value={
            expiryRows.filter(
              row => row.daysLeft <= 3
            ).length
          }
        />

        </div>

      {/* TABLE */}

      <div className="inventory-command-table">

        <table>

          <thead>

            <tr>

              <th>Item Name</th>

              <th>Batch</th>

              <th>Status</th>

              <th>Expiry Date</th>

              <th>Days Left</th>

              <th>Tests Remaining</th>

              <th>Risk</th>

            </tr>

          </thead>

          <tbody>

            {expiryRows.map(item => (

              <tr
                key={item.id}
                className={
                  item.daysLeft <= 3
                    ? "emergency-row"
                    : ""
                }
              >

                <td>
                  {item.reagentName}
                </td>

                <td>
                  {item.batchNo}
                </td>

                <td>
                  {item.status}
                </td>

                <td>
                  {item.expiryDate}
                </td>

                <td>
                  {item.daysLeft}
                </td>

                <td>
                  {item.totalTests || 0}
                </td>

                <td>
                    <EmergencyBadge
                  isEmergency={item.daysLeft <= 3}
                  emergencyText={
                    getRiskLabel(item.daysLeft)
                  }
                  safeText={
                    getRiskLabel(item.daysLeft)
                  }
                />
                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>

  );

};

export default ExpirySurveillanceTab;