
import React, {
  useMemo,
  useState
} from "react";


import DateRangeFilter from "../components/DateRangeFilter";

const ConsumedInventoryTab = ({
  inventoryLogs,
  fromDate,
  toDate,
  setFromDate,
  setToDate,
}) => {

  const [searchTerm, setSearchTerm] =
    useState("");

  const [machineFilter, setMachineFilter] =
    useState("All");

  const [typeFilter, setTypeFilter] =
    useState("All");

  const [expandedRows, setExpandedRows] =
    useState({});

  const toggleRow = id => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const consumedItems = useMemo(() => {

    return inventoryLogs.filter(
      item =>
        item.status === "Consumed"
    );
  
  }, [inventoryLogs]);

  const machineOptions = useMemo(() => {

    return [
      "All",
      ...new Set(
        consumedItems
          .map(
            item => item.machineName
          )
          .filter(Boolean)
      )
    ];

  }, [consumedItems]);

  const typeOptions = useMemo(() => {

    return [
      "All",
      ...new Set(
        consumedItems
          .map(
            item =>
              item.inventoryType
          )
          .filter(Boolean)
      )
    ];

  }, [consumedItems]);

  const filteredRows = useMemo(() => {

    let filtered =
      [...consumedItems];

    if (
      machineFilter !== "All"
    ) {
      filtered =
        filtered.filter(
          item =>
            item.machineName ===
            machineFilter
        );
    }

    if (
      typeFilter !== "All"
    ) {
      filtered =
        filtered.filter(
          item =>
            item.inventoryType ===
            typeFilter
        );
    }

    if (
      searchTerm.trim()
    ) {
      filtered =
        filtered.filter(item => {
    
          const productName =
            (
              item.reagentName ||
              item.productName ||
              item.itemName ||
              ""
            ).toLowerCase();
    
          return productName.includes(
            searchTerm.toLowerCase()
          );
    
        });
    }

    if (fromDate) {

      filtered = filtered.filter(item => {
    
        if (!item.consumedAt)
          return false;
    
        const itemDate = item.consumedAt
          .toDate()
          .toLocaleDateString("en-CA", {
            timeZone: "Asia/Kolkata"
          });
    
        return itemDate >= fromDate;
    
      });
    
    }
    
    if (toDate) {
    
      filtered = filtered.filter(item => {
    
        if (!item.consumedAt)
          return false;
    
        const itemDate = item.consumedAt
          .toDate()
          .toLocaleDateString("en-CA", {
            timeZone: "Asia/Kolkata"
          });
    
        return itemDate <= toDate;
    
      });
    
    }

    return filtered.sort((a, b) => {

      const aDate =
        a.consumedAt?.toDate?.()
          ?.getTime() || 0;
    
      const bDate =
        b.consumedAt?.toDate?.()
          ?.getTime() || 0;
    
      return bDate - aDate;
    
    });

  }, [
    consumedItems,
    machineFilter,
    typeFilter,
    searchTerm,
    fromDate,
    toDate
  ]);

  const groupedRows = useMemo(() => {

    const groups = {};
  
    filteredRows.forEach(item => {
  
      const type =
        item.inventoryType ||
        "Other";
  
      if (!groups[type]) {
        groups[type] = [];
      }
  
      groups[type].push(item);
  
    });
  
    return groups;
  
  }, [filteredRows]);

  const tableOrder = [
    "Reagent",
    "Control",
    "Calibrator",
    "Maintenance",
    "Consumable"
  ];

  return (
 
         
    <div>
     
        <div className="command-filter-bar">

        <h2>
          Consumed Inventory
        </h2>

        <input
          type="text"
          placeholder="Search product..."
          value={searchTerm}
          onChange={e =>
            setSearchTerm(
              e.target.value
            )
          }
        />

        <DateRangeFilter
          fromDate={fromDate}
          toDate={toDate}
          setFromDate={
            setFromDate
          }
          setToDate={
            setToDate
          }
        />

        <select
          value={
            machineFilter
          }
          onChange={e =>
            setMachineFilter(
              e.target.value
            )
          }
        >
          {machineOptions.map(
            machine => (
              <option
                key={machine}
                value={
                  machine
                }
              >
                {machine}
              </option>
            )
          )}
              </select>

              <select
        value={typeFilter}
        onChange={e =>
          setTypeFilter(
            e.target.value
          )
        }
      >
        <option value="All">
          All Types
        </option>

        {typeOptions
          .filter(
            type =>
              type !== "All"
          )
          .map(type => (
            <option
              key={type}
              value={type}
            >
              {type}
            </option>
          ))}
      </select>

      </div>

      <div className="inventory-command-table">

  
      <div
  className="inventory-machine-card"
  style={{
    marginBottom: "30px"
  }}
>

{Object.keys(groupedRows)
  .length === 0 && (

  <div
    style={{
      textAlign: "center",
      padding: "40px"
    }}
  >
    No consumed inventory found.
  </div>

)}

{tableOrder
  .filter(
    type => groupedRows[type]
  )
  .map(type => {

    const rows =
      groupedRows[type];

    return (

    <div
      key={type}
      style={{
        marginBottom: "40px"
      }}
    >

      <h3
        style={{
          marginBottom: "15px"
        }}
      >
        {type}s
      </h3>

      <div
        style={{
          overflowX: "auto"
        }}
      >

        <table
          style={{
            minWidth: "1800px",
            width: "100%"
          }}
        >

          <thead>
            <tr>
              <th>Product</th>
              <th>Lot No</th>
              <th>Box No</th>
              <th>Supplier</th>
              <th>Opened At</th>
              <th>Consumed At</th>
              <th>Consumed</th>
              <th>Bonus</th>
              <th>Excess</th>
              <th>Waste</th>
              <th>Total</th>
              <th>Pack Size</th>
              <th>Activity Rate</th>
              <th>View</th>
            </tr>
          </thead>

          <tbody>

  {rows.map(
    item => {

      const packSize =
        Number(
          item.inventoryQty || 0
        );

      const remaining =
        Number(
          item.totalTests || 0
        );

      const consumed =
        Math.max(
          packSize -
            remaining,
          0
        );

      const bonus =
        Number(
          item.bonusTests || 0
        );

      const excess =
        Number(
          item.excessTests || 0
        );

      const waste =
        Number(
          item.wastedTests || 0
        );

      const total =
        consumed +
        bonus +
        excess +
        waste;

      const activityRate =
        packSize > 0
          ? (
              total /
              packSize
            ) * 100
          : 0;

          return (
            <React.Fragment
              key={item.id}
            >
          
              <tr>
          
                <td>
                  {item.reagentName ||
                    item.productName ||
                    item.itemName ||
                    "-"}
                </td>
          
                <td>
                  {item.lotNo || "-"}
                </td>
          
                <td>
                  {item.boxNo || "-"}
                </td>
          
                <td>
                  {item.supplier || "-"}
                </td>
          
                <td>
                  {item.openedAt
                    ?.toDate?.()
                    ?.toLocaleString() ||
                    "-"}
                </td>
          
                <td>
                  {item.consumedAt
                    ?.toDate?.()
                    ?.toLocaleString() ||
                    "-"}
                </td>
          
                <td>
                  {consumed}
                </td>
          
                <td>
                  {bonus}
                </td>
          
                <td
                  style={{
                    color: "#ff6b6b",
                    fontWeight: 600
                  }}
                >
                  {excess}
                </td>
          
                <td
                  style={{
                    color: "#ff6b6b",
                    fontWeight: 600
                  }}
                >
                  {waste}
                </td>
          
                <td>
                  {total}
                </td>
          
                <td>
                  {packSize}
                </td>
          
                <td
                  style={{
                    color: "#4ade80",
                    fontWeight: 600
                  }}
                >
                  {activityRate.toFixed(1)}%
                </td>
          
                <td>
          
                  <button
                    onClick={() =>
                      toggleRow(
                        item.id
                      )
                    }
                  >
                    {expandedRows[item.id]
                      ? "▲"
                      : "▼"}
                  </button>
          
                </td>
          
              </tr>
          
              {expandedRows[item.id] && (
          
                <tr>
          
                  <td colSpan={14}>
          
                    {item.wastageStatus ? (
                      <>
                        <strong>
                          Waste Reason:
                        </strong>{" "}
                        {item.wasteReason ||
                          "N/A"}
                      </>
                    ) : (
                      <>
                        No additional details available
                      </>
                    )}
          
                  </td>
          
                </tr>
          
              )}
          
            </React.Fragment>
          );
          
          }
          )}
          
          </tbody>

</table>

</div>

</div>

);

})}

</div>

</div>

</div>
);

};

export default ConsumedInventoryTab;