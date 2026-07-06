
import React from "react";

export default function PatientListModal({ open, onClose, patients }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Patient / Test Details</h3>
        <button onClick={onClose}>Close</button>
        <div className="table-container" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Reg No</th>
                <th>Diag No</th>
                <th>Name</th>
                <th>Test</th>
                <th>Dept</th>
                <th>Printed</th>
                <th>Collected</th>
                <th>Scanned</th>
                <th>Saved</th>
                <th>Validated</th>
                <th>Saved By</th>
                <th>Validated By</th>
                <th>Entered By</th>

              </tr>
            </thead>
            <tbody>
              {patients.map((p, i) => (
                <tr key={i}>
                  <td>{p.regNo}</td>
                  <td>{p.diagnosticNo || "—"}</td>
                  <td>{p.name}</td>
                  <td>{p.test}</td>
                  <td>{p.department}</td>
                  <td>
                    {p.timePrinted ? new Date(p.timePrinted).toLocaleString() : "—"}
                  </td>
                  <td>
                    {p.timeCollected ? new Date(p.timeCollected).toLocaleString() : "—"}
                  </td>
                  <td>
                    {p.timeScanned ? new Date(p.timeScanned).toLocaleString() : "—"}
                  </td>
                  <td>
                    {p.timeSaved ? new Date(p.timeSaved).toLocaleString() : "—"}
                  </td>
                  <td> 
                    {p.timeValidated ? new Date(p.timeValidated).toLocaleString(): "—"} </td>
                 
                  <td>
                    {p.savedBy || "—"}
                  </td>

                  <td>
                    {p.validatedBy || "—"}
                  </td>

                  <td>
                    {p.enteredBy || "—"}
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}