
import React from "react";

export default function PatientListModal({ open, onClose, patients }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Patient / Test Details</h3>
        <button className="close-btn" onClick={onClose}>Close</button>
        <table>
          <thead>
            <tr>
              <th>Reg</th>
              <th>Diag No</th>
              <th>Name</th>
              <th>Test</th>
              <th>Dept</th>
              <th>Collected</th>
              <th>Saved</th>
              <th>Saved By</th>

              {/* Validated Header Removed */}
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
                  {p.timeCollected
                    ? new Date(p.timeCollected).toLocaleString()
                    : "—"}
                </td>

                <td>
                  {p.timeSaved
                    ? new Date(p.timeSaved).toLocaleString()
                    : "—"}
                </td>

                <td>
                  {p.savedBy || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}