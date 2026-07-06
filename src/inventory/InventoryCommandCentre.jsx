
import React from 'react';

export default function InventoryCommandCenter() {
  return (
    <div className="command-center">
      <h1>Lab Inventory Analytics</h1>
      <table className="analytics-table">
        <thead>
          <tr>
            <th>Reagent Name</th>
            <th>Opening Stock</th>
            <th>Purchases (+)</th>
            <th>Tests Done (-)</th>
            <th>Wastage (-)</th>
            <th>Current Stock</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {/* Logic to aggregate data from inventory_master and inventory_logs */}
          <tr>
            <td>Vitros Glucose Slides</td>
            <td>500</td>
            <td>1000</td>
            <td>850</td>
            <td>10</td>
            <td>640</td>
            <td className="status-ok">7 Days Left</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}