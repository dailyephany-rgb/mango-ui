
import React from "react";

export default function OutsourcePatientModal({ open, onClose, patients }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Outsourced Patient / Test Details</h3>
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
              <th>Received</th>
              <th>Time Given</th>
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
                {/* timeCollected pulled from separate Firebase field */}
                <td>{p.timeCollected ? new Date(p.timeCollected).toLocaleString() : "—"}</td>
                {/* receivedTime mapped from receivedTime in Firebase */}
                <td>{p.receivedTime ? new Date(p.receivedTime).toLocaleString() : "—"}</td>
                {/* givenTime mapped from givenTime in Firebase */}
                <td>{p.givenTime ? new Date(p.givenTime).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}