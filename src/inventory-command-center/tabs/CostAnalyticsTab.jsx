

import React, {useMemo,useState} from "react";

import DateRangeFilter
from "../components/DateRangeFilter";

const CostAnalyticsTab = ({
  ledgerEntries,
  inventory
}) => {

  const [machineFilter, setMachineFilter] =
  useState("All");

const [typeFilter, setTypeFilter] =
  useState("All");

const [actionFilter, setActionFilter] =
  useState("All");

const [expandedRows, setExpandedRows] =
  useState({});
const [expandedBatches, setExpandedBatches] =
  useState({});

const [showCost, setShowCost] =
  useState(true);

const [searchTerm, setSearchTerm] =
    useState("");

    const today =
    new Date().toLocaleDateString(
      "en-CA",
      {
        timeZone: "Asia/Kolkata"
      }
    );
  
  const [fromDate, setFromDate] =
    useState(today);
  
  const [toDate, setToDate] =
    useState(today);

const filteredRows = useMemo(() => {

      let filtered = [...ledgerEntries];
    
      if (machineFilter !== "All") {
        filtered = filtered.filter(
          row => row.machine === machineFilter
        );
      }
    
      if (typeFilter !== "All") {
        filtered = filtered.filter(
          row =>
            row.inventoryType === typeFilter
        );
      }
    
      if (actionFilter !== "All") {
        filtered = filtered.filter(
          row =>
            row.actionType === actionFilter
        );
      }
    
      if (searchTerm.trim()) {
    
        filtered = filtered.filter(
          row =>
            row.productName
              ?.toLowerCase()
              .includes(
                searchTerm.toLowerCase()
              )
        );
    
      }
    
      if (fromDate) {
    
        const from = new Date(fromDate);
    
        filtered = filtered.filter(row => {
    
          if (!row.timestamp)
            return false;
    
          return (
            row.timestamp.toDate() >= from
          );
    
        });
    
      }
    
      if (toDate) {
    
        const to = new Date(toDate);
    
        to.setHours(23,59,59);
    
        filtered = filtered.filter(row => {
    
          if (!row.timestamp)
            return false;
    
          return (
            row.timestamp.toDate() <= to
          );
    
        });
    
      }
    
      return filtered;
    
    }, [
      ledgerEntries,
      machineFilter,
      typeFilter,
      actionFilter,
      searchTerm,
      fromDate,
      toDate
    ]);


    const inventoryLookup = useMemo(() => {

      const lookup = {};
    
      inventory.forEach(item => {
    
        const key =
          `${item.reagentName}__${item.lotNo || "N/A"}__${item.boxNo || "-"}`;
    
        lookup[key] = item;
    
      });
    
      return lookup;
    
    }, [inventory]);

    
    const groupedRows = useMemo(() => {
    
      const groups = {};
      const orderedRows = [...filteredRows];
      orderedRows.forEach(row => {

        let costGroup =
        row.testName;
      
      if (
        ["Excess", "Waste", "Bonus"]
          .includes(row.actionType)
      ) {
        costGroup = "EXTRAS";
      }
      
      const key =
      `${row.productName}__${costGroup}__${row.machine}`;

        if (!groups[key]) {
          groups[key] = {
            key,
            productName: row.productName,
            testName: costGroup,
            machine: row.machine,
            metricType: row.metricType || "",
            totalUsage: 0,
            totalCost: 0,
            records: []
          };
    
        }
        
        const qty =  Number(row.qty || 0);
          if (row.actionType !== "Bonus") {
            groups[key].totalUsage += qty;
          }
        
        const packetKey =
          `${row.productName}__${row.batchNo || "N/A"}__${row.boxNo || "-"}`;
        
        const packet =
          inventoryLookup[packetKey];

          

          if (packet) {

            const capacity =
              Number(packet.inventoryQty || 0);
          
            const packetAmount =
              Number(packet.totalAmount || 0);
          
            const costPerUnit =
              capacity > 0
                ? packetAmount / capacity
                : 0;
          
            const qty =
              Number(row.qty || 0);
              
          
            const shouldCount =
              row.actionType !== "Bonus";
          
            if (shouldCount) {
            groups[key].totalCost = Number(
              (
                groups[key].totalCost +
                qty * costPerUnit
              ).toFixed(2)
            );
          }
          }
    
        groups[key].records.push(row);

      
      });
    
      return Object.values(groups).sort(
        (a, b) =>
          b.totalUsage - a.totalUsage
      );
    
    }, [filteredRows, inventoryLookup]);
    
    const machineGroups = useMemo(() => {

      const groups = {};
    
      groupedRows.forEach(group => {
    
        const machine =
          group.machine || "N/A";
    
        const type =
          group.records[0]
            ?.inventoryType ||
          "Other";
    
        if (!groups[machine]) {
    
          groups[machine] = {};
    
        }
    
        if (!groups[machine][type]) {
    
          groups[machine][type] = [];
    
        }
    
        groups[machine][type].push(
          group
        );
    
      });
    
      return groups;
    
    }, [groupedRows]);




   
    const machineOptions = useMemo(() => {

      return [
        "All",
        ...new Set(
          ledgerEntries
            .map(row => row.machine)
            .filter(Boolean)
        )
      ];
    
    }, [ledgerEntries]);
       
      const toggleRow = (key) => {

        setExpandedRows(prev => ({
      
          ...prev,
      
          [key]: !prev[key]
      
        }));
      
      };
      
      const toggleBatch = (key) => {
      
        setExpandedBatches(prev => ({
      
          ...prev,
      
          [key]: !prev[key]
      
        }));
      
      };


      const getBatchBreakdown = (records) => {

        const batches = {};
      
        records.forEach(record => {
      
          const batchNo =
          record.batchNo || "N/A";

          const boxNo =
            record.boxNo || "-";

            const batchKey =
              `${batchNo}__${boxNo}`;

            if (!batches[batchKey]) {
              
              batches[batchKey] = {
                batchNo: record.batchNo || "N/A",
                boxNo: record.boxNo || "-",
                consumed: 0,
                waste: 0,
                bonus: 0,
                excess: 0,
                total: 0,
                packSize: 0,
                packetAmount: 0,
                costPerUnit: 0,
                cost: 0,

                records: []
              };
            }
            
                  
          const qty =
            Number(record.qty || 0);

            const packetKey =
            `${record.productName}__${record.batchNo || "N/A"}__${record.boxNo || "-"}`;
            
            const packet =
              inventoryLookup[packetKey];
            
              if (packet) {
                const capacity =
                  Number(packet.inventoryQty || 0);
              
                const packetAmount =
                  Number(packet.totalAmount || 0);
              
                const costPerUnit =
                  capacity > 0
                    ? packetAmount / capacity
                    : 0;
              
                batches[batchKey].packSize =
                  capacity;
              
                batches[batchKey].packetAmount =
                  packetAmount;
              
                batches[batchKey].costPerUnit =
                  costPerUnit;
              }

            batches[batchKey].records.push(
              record
            );
      
          switch (record.actionType) {
      
            case "Consumed":
              batches[batchKey].consumed += qty;
              break;
      
            case "Waste":
              batches[batchKey].waste += qty;
              break;
      
            case "Bonus":
              batches[batchKey].bonus += qty;
              break;
      
            case "Excess":
              batches[batchKey].excess += qty;
              break;
      
              case "QC":
                batches[batchKey].consumed += qty;
                break;
              
              case "Calibration":
                batches[batchKey].consumed += qty;
                break;
              
              case "Maintenance":
                batches[batchKey].consumed += qty;
                break;
      
            default:
              break;
      
          }

          const utilizedQty =
          batches[batchKey].consumed +
          batches[batchKey].waste +
          batches[batchKey].excess;
        
          batches[batchKey].cost = Number(
            (
              utilizedQty *
              batches[batchKey].costPerUnit
            ).toFixed(2)
          );
      
        });
      
        return Object.values(batches).sort((a, b) => {
          const batchCompare =
            String(a.batchNo).localeCompare(
              String(b.batchNo)
            );
        
          if (batchCompare !== 0) {
            return batchCompare;
          }
        
          return String(a.boxNo).localeCompare(
            String(b.boxNo)
          );
        });
      
      };

    
  return (

    <div className="command-tab-container">

     {/* FILTERS */}

<div className="command-filter-bar">



<h2>
  Cost Analytics
</h2>

<input
  type="text"
  placeholder="Search product..."
  value={searchTerm}
  onChange={(e) =>
    setSearchTerm(e.target.value)
  }
/>

<DateRangeFilter
  fromDate={fromDate}
  toDate={toDate}
  setFromDate={setFromDate}
  setToDate={setToDate}
/>

<select
  value={machineFilter}
  onChange={(e) =>
    setMachineFilter(e.target.value)
  }
>
  {machineOptions.map(machine => (
    <option
      key={machine}
      value={machine}
    >
      {machine}
    </option>
  ))}
</select>

<select
  value={typeFilter}
  onChange={(e) =>
    setTypeFilter(e.target.value)
  }
>
  <option value="All">
    All Types
  </option>

  <option value="Reagent">
    Reagent
  </option>

  <option value="Control">
    Control
  </option>

  <option value="Calibrator">
    Calibrator
  </option>

  <option value="Consumable">
    Consumable
  </option>

  <option value="Maintenance">
    Maintenance
  </option>
</select>

<select
  value={actionFilter}
  onChange={(e) =>
    setActionFilter(e.target.value)
  }
>
  <option value="All">
    All Actions
  </option>

  <option value="Consumed">
    Consumed
  </option>

  <option value="Waste">
    Waste
  </option>

  <option value="Bonus">
    Bonus
  </option>

  <option value="Excess">
    Excess
  </option>

  <option value="QC">
    QC
  </option>

  <option value="Calibration">
    Calibration
  </option>

  <option value="Maintenance">
    Maintenance
  </option>
</select>

<button
  onClick={() =>
    setShowCost(prev => !prev)
  }
  style={{
    height: "42px",
    minWidth: "110px",
    padding: "0 16px",
    background: showCost
      ? "#2953ff"
      : "rgba(255,255,255,0.06)",
    border: `1px solid ${
      showCost
        ? "#2953ff"
        : "rgba(255,255,255,0.12)"
    }`,
    borderRadius: "10px",
    color: "#fff",
    fontSize: "0.85rem",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all 0.2s ease"
  }}
>
  {showCost
    ? "Show Cost"
    : "Hide Cost"}
</button>
</div>


<div className="inventory-command-table">
{Object.entries(
  machineGroups
).map(
  ([machine, types]) => (

  
    <div
      key={machine}
      className="inventory-machine-card"
      style={{
        marginBottom: "30px"
      }}
    >

      <h2
        style={{
          marginBottom: "15px"
        }}
      >
        {machine}
      </h2>

      {Object.entries(
        types
      ).map(
        ([inventoryType, groups]) => (

          <div
            key={inventoryType}
            style={{
              marginBottom: "20px"
            }}
          >

            <h3
              style={{
                marginTop: "20px",
                marginBottom: "10px"
              }}
            >
              {inventoryType}s
            </h3>

            <table
  style={{
    width: "100%"
  }}
>

  <thead>

    <tr>

    <th>
  Product Name
  </th>

  <th>
    Test Name
  </th>

  <th>
  Activity Types
  </th>

  <th>
  Total Usage
  </th>

  {showCost && (
  <th>
    Total Cost
  </th>
)}
  
  <th>
  View
  </th>

    </tr>

  </thead>

  <tbody>


  {groups.map(group => {

const batches =
  getBatchBreakdown(
    group.records
  );



return (

  <React.Fragment
    key={group.key}
  >
   
                     <tr>
                       <td>
        {group.productName}

        {group.level &&
          ` (${group.level})`}
      </td>
      <td>
        {group.testName}
        </td>

        <td>
          {[
            ...new Set(
              group.records.map(
                r => r.actionType
              )
            )
          ].join(", ")}
        </td>

                      <td>

              {group.totalUsage}

              {" "}

              {group.metricType}
              </td>

                {showCost && (
                <td>
                  ₹{group.totalCost.toFixed(2)}
                </td>
              )}

              <td>

                <button
                  className="btn-mini"
                  onClick={() =>
                    toggleRow(
                      group.key
                    )
                  }
                >
                  {expandedRows[
                    group.key
                  ]
                    ? "▲"
                    : "▼"}
                </button>

              </td>

            </tr>

            {expandedRows[
              group.key
            ] && (

              <tr>               
              <td
                colSpan={
                  showCost
                    ? 6
                    : 5
                }
              >
                     <table
                    style={{
                      width:
                        "100%"
                    }}
                  >

                    <thead>

                      <tr>

                      <th>Batch No</th>
                      <th>Box No</th>
                      <th>Consumed</th>
                      <th>Waste</th>
                      <th>Bonus</th>
                      <th>Excess</th>
                      <th>Total</th>
                      <th>Pack Size</th>
                      {showCost && (
                        <>
                          <th>Packet Amount</th>
                          <th>Cost/Test</th>
                          <th>Cost</th>
                        </>
                      )}
                      <th>View</th>
                      </tr>

                    </thead>

                    <tbody>

                      {batches.map(
                        batch => {

                          const total =
                          batch.consumed +
                          batch.waste +
                          batch.excess;
                            return (
                              <React.Fragment
                               key={`${batch.batchNo}_${batch.boxNo}`}>
                                <tr>
                            
                                <td>
                                  {batch.batchNo}
                                </td>

                                <td>
                                  {batch.boxNo}
                                </td>
                          
                                <td>
                                  {batch.consumed}
                                </td>
                            
                                  <td>
                                    {batch.waste}
                                  </td>
                            
                                  <td>
                                    {batch.bonus}
                                  </td>
                            
                                  <td>
                                    {batch.excess}
                                  </td>
                            
                                  <td>
                                    {total}
                                  </td>
                                                                  <td>
                                  {batch.packSize}
                                </td>

                                {showCost && (
                                  <>
                                    <td>
                                      ₹{batch.packetAmount.toFixed(2)}
                                    </td>

                                    <td>
                                      ₹{batch.costPerUnit.toFixed(2)}
                                    </td>

                                    <td>
                                      ₹{batch.cost.toFixed(2)}
                                    </td>
                                  </>
                                )}          
                                 <td>
                            
                                    <button
                                      className="btn-mini"
                                      onClick={() =>
                                        toggleBatch(
                                          `${group.key}_${batch.batchNo}_${batch.boxNo}`
                                        )
                                      }
                                    >
                                      {expandedBatches[
                                      `${group.key}_${batch.batchNo}_${batch.boxNo}`
                                      ]
                                        ? "▲"
                                        : "▼"}
                                    </button>
                            
                                  </td>
                            
                                </tr>
                            
                                {expandedBatches[
                                `${group.key}_${batch.batchNo}_${batch.boxNo}`
                                ] && (
                            
                                  <tr>
                                                              
                                     <td
                                    colSpan={
                                      showCost
                                        ? 12
                                        : 9
                                    }
                                  >      
                                      <table
                                        style={{
                                          width: "100%",
                                          marginTop: "10px"
                                        }}
                                      >
                            
                                        <thead>
                            
                                          <tr>
                            
                                            <th>Date</th>
                            
                                            <th>Action</th>
                            
                                            <th>Qty</th>
                            
                                            <th>Test / Event</th>
                            
                                          </tr>
                            
                                        </thead>
                            
                                        <tbody>
                            
                                          {batch.records.map(
                                            (record, index) => (
                            
                                              <tr
                                                key={index}
                                              >
                            
                                                <td>
                                                  {record.timestamp
                                                    ?.toDate?.()
                                                    ?.toLocaleString()}
                                                </td>
                            
                                                <td>
                                                  {record.actionType}
                                                </td>
                            
                                                <td>
                                                  {record.qty}
                                                </td>
                            
                                                <td>
                                                  {record.testName}
                                                </td>
                            
                                              </tr>
                            
                                            )
                                          )}
                            
                                        </tbody>
                            
                                      </table>
                            
                                    </td>
                            
                                  </tr>
                            
                                )}
                            
                              </React.Fragment>
                            
                            );
                        
                        })}

                  
                    </tbody>

                  </table>

                </td>

              </tr>

            
)}

</React.Fragment>

);
})}

</tbody>


</table>

</div>

))}

</div>

))}

</div>

</div>

);

};

export default CostAnalyticsTab;