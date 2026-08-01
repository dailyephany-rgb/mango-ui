
import React, {useMemo,useState} from "react";

import DateRangeFilter
from "../components/DateRangeFilter";

const ComboConsumptionLedgerTab = ({
  ledgerEntries,
  fromDate,
  toDate,
  setFromDate,
  setToDate,
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
  const [expandedProducts, setExpandedProducts] =
  useState({});

  const [searchTerm, setSearchTerm] =
    useState("");

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

        const search =
          searchTerm.toLowerCase();
          
          filtered = filtered.filter(row =>

            row.productName
              ?.toLowerCase()
              .includes(search)
          
            ||
          
            row.testName
              ?.toLowerCase()
              .includes(search)
          
            ||
          
            row.category
              ?.toLowerCase()
              .includes(search)
          
            ||
          
            row.machine
              ?.toLowerCase()
              .includes(search)
          
          );
      
      }

      if (fromDate) {

        filtered = filtered.filter(row => {
      
          if (!row.timestamp)
            return false;
      
          const rowDate = row.timestamp
            .toDate()
            .toLocaleDateString("en-CA", {
              timeZone: "Asia/Kolkata"
            });
      
          return rowDate >= fromDate;
      
        });
      
      }
      
      if (toDate) {
      
        filtered = filtered.filter(row => {
      
          if (!row.timestamp)
            return false;
      
          const rowDate = row.timestamp
            .toDate()
            .toLocaleDateString("en-CA", {
              timeZone: "Asia/Kolkata"
            });
      
          return rowDate <= toDate;
      
        });
      
      }
    
      
    
      return filtered;
    
    }, 
    [
      ledgerEntries,
      machineFilter,
      typeFilter,
      actionFilter,
      searchTerm,
      fromDate,
      toDate
    ]
    );
    
    const groupedRows = useMemo(() => {
    
      const groups = {};
      const orderedRows = [...filteredRows];
      orderedRows.forEach(row => {

        const key = `${row.testName}__${row.category}__${row.machine}`;

        if (!groups[key]) {
  
          groups[key] = {

            key,
          
            testName: row.testName || "-",
          
            category: row.category || "-",
          
            machine: row.machine,
          
            inventoryType: row.inventoryType,
          
            metricType: row.metricType || "",
          
            totalUsage: 0,
          
            records: []
          
          };
    
        }
    
        groups[key].totalUsage +=
          Number(row.qty || 0);
    
        groups[key].records.push(row);

        if (
          row.actionType === "Consumed" &&
          row.testName
        ) {
          
        }
    
      });
    
      return Object.values(groups).sort(
        (a, b) =>
          b.totalUsage - a.totalUsage
      );
    
    }, [
      filteredRows
    ]);
    


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

      const toggleProduct = (key) => {

        setExpandedProducts(prev => ({
      
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


      const getProductBreakdown = (records) => {

        const products = {};
      
        records.forEach(record => {
      
          const key = record.productName || "Unknown";
      
          if (!products[key]) {
      
            products[key] = {
      
              productName: key,
      
              totalUsage: 0,
      
              metricType: record.metricType || "",
      
              records: []
      
            };
      
          }
      
          products[key].totalUsage +=
            Number(record.qty || 0);
      
          products[key].records.push(record);
      
        });
      
        return Object.values(products).sort(
          (a, b) =>
            a.productName.localeCompare(
              b.productName
            )
        );
      
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
                batchNo,
                boxNo,
                consumed: 0,
                waste: 0,
                bonus: 0,
                excess: 0,
                qc: 0,
                calibration: 0,
                maintenance: 0,
                records: []
              };
            }
            
             
      
          const qty =
            Number(record.qty || 0);

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
      
        });
      
        return Object.values(batches).sort(
          (a, b) => {
        
            const aNum = Number(a.batchNo);
            const bNum = Number(b.batchNo);
        
            if (
              !Number.isNaN(aNum) &&
              !Number.isNaN(bNum)
            ) {
              return aNum - bNum;
            }
        
            return a.batchNo.localeCompare(
              b.batchNo
            );
        
          }
        );
      
      };

    
  return (

    <div className="command-tab-container">

     {/* FILTERS */}

<div className="command-filter-bar">

<h2>
Combo Consumption Ledger
</h2>

<div className="command-tabs">

  <button
    className="active-tab"
  >
    Combo View
  </button>

</div>

<input
  type="text"
  placeholder="Search product, test or category..."
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

</div>

{groupedRows.length === 0 && (

<div
  className="empty-state"
  style={{
    padding: "30px",
    textAlign: "center",
    fontWeight: "600"
  }}
>

  No combo consumption records found.

</div>

)}


{groupedRows.length > 0 && (

<div className="inventory-command-table">
{Object.entries(machineGroups)
  .sort(([a], [b]) =>
    a.localeCompare(b)
  )
  .map(([machine, types]) => (

  
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
  Test Name
</th>

<th>
  Category
</th>

<th>
  Activity Types
</th>

<th>
Total Usage
</th>

<th>
  View
</th>

    </tr>

  </thead>

  <tbody>


  {groups.map(group => {


return (

  <React.Fragment
    key={group.key}
  >
   
                     <tr>
                 <td>
              {group.testName}
            </td>

            <td>
              {group.category}
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
                  colSpan={5}
                >

                  <table
                    style={{
                      width:
                        "100%"
                    }}
                  >

                  <thead>

                  <tr>

                  <th>
                  Product Name
                  </th>

                  <th>
                  Activity Types
                  </th>

                  <th>
                  Total Usage
                  </th>

                  <th>
                  View
                  </th>

                  </tr>

                  </thead>


                  <tbody>

{(() => {

  const products =
    getProductBreakdown(group.records);

  return products.map(product => {

    const productKey =
      `${group.key}_${product.productName}`;

    return (

      <React.Fragment
        key={productKey}
      >

        <tr>

          <td>
            {product.productName}
          </td>

          <td>

            {[
              ...new Set(
                product.records.map(
                  r => r.actionType
                )
              )
            ].join(", ")}

          </td>

          <td>

            {product.totalUsage}
            {" "}
            {product.metricType}

          </td>

          <td>

            <button
              className="btn-mini"
              onClick={() =>
                toggleProduct(
                  productKey
                )
              }
            >

              {expandedProducts[
                productKey
              ]
                ? "▲"
                : "▼"}

            </button>

          </td>

        </tr>

        {expandedProducts[productKey] && (() => {

const batches =
  getBatchBreakdown(product.records);

return (

  <tr>

    <td colSpan={4}>

      <table style={{ width: "100%" }}>

        <thead>

          <tr>

            <th>Batch No</th>

            <th>Box No</th>

            <th>Consumed</th>

            <th>Waste</th>

            <th>Bonus</th>

            <th>Excess</th>

            <th>Total</th>

            <th>View</th>

          </tr>

        </thead>

        <tbody>

          {batches.map(batch => {

            const batchKey =
              `${productKey}_${batch.batchNo}_${batch.boxNo}`;

            const total =
              batch.consumed +
              batch.waste +
              batch.bonus +
              batch.excess;

            return (

              <React.Fragment key={batchKey}>

                <tr>

                  <td>{batch.batchNo}</td>

                  <td>{batch.boxNo}</td>

                  <td>{batch.consumed}</td>

                  <td>{batch.waste}</td>

                  <td>{batch.bonus}</td>

                  <td>{batch.excess}</td>

                  <td>{total}</td>

                  <td>

                    <button
                      className="btn-mini"
                      onClick={() =>
                        toggleBatch(batchKey)
                      }
                    >
                      {expandedBatches[batchKey]
                        ? "▲"
                        : "▼"}
                    </button>

                  </td>

                </tr>

                {expandedBatches[batchKey] && (

<tr>

  <td colSpan={8}>

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

            <tr key={index}>

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

);

})()}

      </React.Fragment>

    );

  });

})()}

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
)}

</div>

);

};

export default ComboConsumptionLedgerTab;