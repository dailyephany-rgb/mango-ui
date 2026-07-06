
import React, { useMemo, useState } from "react";

import {buildInventoryRows} from "../utils/inventoryAggregations";
import MetricCard from "../components/MetricCard";
import EmergencyBadge
from "../components/EmergencyBadge";


const LiveInventoryTab = ({
  inventoryLogs
}) => {
  
  const [searchTerm, setSearchTerm] =
    useState("");

  const [machineFilter, setMachineFilter] =
  useState("All");


  const inventoryRows = useMemo(() => {

    let filtered = [...inventoryLogs];
    if (machineFilter !== "All") {


    filtered = filtered.filter(item =>
  item.machineName
    ?.toLowerCase()
    .trim() ===
  machineFilter
    .toLowerCase()
    .trim()
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

    return buildInventoryRows(filtered);

  }, [
    inventoryLogs,
    machineFilter,
    searchTerm
  ]);
  return (

    <div className="command-tab-container">

      {/* HEADER */}

                  <div className="command-filter-bar">
                  <select
              value={machineFilter}
              onChange={(e) =>
                setMachineFilter(
                  e.target.value
                )
              }
            >

              <option value="All">
                All Machines
              </option>

              <option value="VITROS 6500">
                VITROS 6500
              </option>

              <option value="YUMIZEN C-150">
                YUMIZEN C-150
              </option>

              <option value="ACCESS 2">
                ACCESS 2
              </option>

              <option value="GEM 3500">
                GEM 3500
              </option>

              <option value="MISPA I2">
                MISPA I2
              </option>

              <option value="FIVE PART MACHINE">
                FIVE PART MACHINE
              </option>

              <option value="THREE PART MACHINE">
                THREE PART MACHINE
              </option>

              <option value="YUMIZEN G-800">
                YUMIZEN G-800
              </option>

              <option value="BACKROOM">
                BACKROOM
              </option>

            </select>




            
        <h2>Live Inventory Position</h2>

        <input
            type="text"
            placeholder="Search reagent..."
            value={searchTerm}
            onChange={(e) =>
              setSearchTerm(e.target.value)
            }
          />


      </div>


      <div className="metric-cards-grid">

      <MetricCard
  label="Total Inventory Items"
  value={
    Object.values(inventoryRows)
      .flat()
      .length
  }
/>

<MetricCard
  label="Emergency Items"
  value={
    Object.values(inventoryRows)
      .flat()
      .filter(row => row.isEmergency)
      .length
  }
/>
     
    

</div>



   {Object.entries(inventoryRows).map(
  ([type, rows]) => {

    if (!rows.length) return null;

    const unitLabel =
      type === "Reagent"
        ? "Tests"
        : type === "Consumable"
        ? "Packs"
        : "ML";

    return (

      <div
        key={type}
        className="inventory-section-block"
        style={{ marginTop: "30px" }}
      >

        <h3
          style={{
            marginBottom: "15px",
            color: "var(--neon-blue)"
          }}
        >
          {type.toUpperCase()}S
        </h3>

        <div className="inventory-command-table">

          <table>

            <thead>

              <tr>

                <th>Item Name</th>

                <th>
                  Active ({unitLabel})
                </th>

                <th>
                  In Storage ({unitLabel})
                </th>

                <th>
                  Total Available ({unitLabel})
                </th>

                <th>Baseline</th>

                <th>Emergency</th>

              </tr>

            </thead>

            <tbody>

              {rows.map(row => (

                <tr
                  key={`${type}-${row.reagentName}`}
                  className={
                    row.isEmergency
                      ? "emergency-row"
                      : ""
                  }
                >

                  <td>
                    {row.reagentName}
                  </td>

                  <td>
                    {row.active}
                  </td>

                  <td>
                    {row.storage}
                  </td>

                  <td>
                    {row.totalAvailable}
                  </td>

                  <td>
                    {row.baseline}
                  </td>

                  <td>

                    <EmergencyBadge
                      isEmergency={
                        row.isEmergency
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

})
}

</div>

);

};

export default LiveInventoryTab;