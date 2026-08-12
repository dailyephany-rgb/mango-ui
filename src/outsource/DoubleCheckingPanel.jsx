/**
 * Double Checking — isolated from master_register / outsource_tracking / report_details.
 * Persists only to Firestore collection: double_check_outsource
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  setDoc,
  doc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { trackedOnSnapshot as onSnapshot } from "../shared/firestore/trackedFirestore.js";
import { db } from "../firebaseConfig";
import OUTSOURCE_MAP from "../Outsource.json";
import {
  parseEntryDate,
  getLocalDateString,
  localDayStart,
  localDayEndExclusive,
} from "../shared/utils/dates.js";
import { usePersistedObjectState } from "../shared/hooks/usePersistedObjectState.js";

export const DOUBLE_CHECK_TAB = "Double Checking";
export const DOUBLE_CHECK_COLLECTION = "double_check_outsource";

const LAB_OPTIONS = Object.keys(OUTSOURCE_MAP);

const EMPTY_FORM = {
  regNo: "",
  diagnosticNo: "",
  name: "",
  doctor: "",
  age: "",
  ageUnit: "years",
  source: "OPD",
  tests: "",
  labName: "",
};

function buildDocId(regNo, diagnosticNo, labName) {
  const labSlug = String(labName || "").replace(/\s+/g, "");
  return `${String(regNo).trim()}_${String(diagnosticNo).trim()}_${labSlug}_DOUBLECHECK`;
}

function parseTests(raw) {
  return String(raw || "")
    .split(/[,;\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function toTime(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function DoubleCheckingPanel({
  dateFrom,
  dateTo,
  activeSource,
  regSearch,
  currentUser,
}) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const [localBuffer, setLocalBuffer] = usePersistedObjectState(
    "double_check_localBuffer",
    {}
  );
  const bufferRef = useRef(localBuffer);
  useEffect(() => {
    bufferRef.current = localBuffer;
  }, [localBuffer]);

  useEffect(() => {
    const fromStr = dateFrom || getLocalDateString();
    const toStr = dateTo || getLocalDateString();
    const start = localDayStart(fromStr);
    const endExclusive = localDayEndExclusive(toStr);
    if (!start || !endExclusive) {
      setRows([]);
      return undefined;
    }

    const q = query(
      collection(db, DOUBLE_CHECK_COLLECTION),
      where("timePrinted", ">=", Timestamp.fromDate(start)),
      where("timePrinted", "<", Timestamp.fromDate(endExclusive)),
      orderBy("timePrinted", "asc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(
          snap.docs.map((d) => {
            const data = d.data();
            const buffered = bufferRef.current[d.id] || {};
            return {
              id: d.id,
              uniqueTrackingId: d.id,
              accessionNo: data.diagnosticNo || "—",
              displayTests: data.selectedTests || data.tests || [],
              ...data,
              ...buffered,
            };
          })
        );
      },
      (err) => {
        console.error(
          "[DoubleChecking] double_check_outsource query failed:",
          err
        );
        setRows([]);
      }
    );
    return () => unsub();
  }, [dateFrom, dateTo]);

  const filtered = useMemo(() => {
    return rows
      .filter((e) => {
        if (activeSource !== "All" && e.source !== activeSource) return false;
        if (regSearch.trim()) {
          const s = regSearch.trim().toLowerCase();
          const regKey = String(e.regNo || "").toLowerCase();
          const accKey = String(e.diagnosticNo || e.accessionNo || "").toLowerCase();
          if (!regKey.includes(s) && !accKey.includes(s)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const dateA = parseEntryDate(a, ["timePrinted"]);
        const dateB = parseEntryDate(b, ["timePrinted"]);
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA - dateB;
      });
  }, [rows, activeSource, regSearch]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const canCreate =
    form.regNo.trim() &&
    form.diagnosticNo.trim() &&
    form.name.trim() &&
    form.labName &&
    parseTests(form.tests).length > 0;

  const handleCreate = async () => {
    if (!canCreate || creating) return;
    const regNo = form.regNo.trim();
    const diagnosticNo = form.diagnosticNo.trim();
    const labName = form.labName;
    const selectedTests = parseTests(form.tests);
    const docId = buildDocId(regNo, diagnosticNo, labName);

    try {
      setCreating(true);
      const ref = doc(db, DOUBLE_CHECK_COLLECTION, docId);
      const existing = await getDoc(ref);
      if (existing.exists()) {
        alert(
          `❌ An entry already exists for ${regNo} / ${diagnosticNo} → ${labName}.`
        );
        return;
      }

      const now = new Date();
      await setDoc(ref, {
        compositeId: docId,
        regNo,
        diagnosticNo,
        name: form.name.trim(),
        doctor: form.doctor.trim(),
        doctorName: form.doctor.trim(),
        age: form.age || "",
        ageUnit: form.ageUnit || "years",
        source: form.source || "OPD",
        labName,
        selectedTests,
        tests: selectedTests,
        concernedPerson: "",
        relation: "",
        mobileNo: "",
        isCollected: false,
        isReceived: false,
        isGiven: false,
        outsourcedCollectedTime: null,
        reportReceivedTime: null,
        reportDeliveredTime: null,
        collectedBy: "",
        receivedBy: "",
        deliveredBy: "",
        status: "Pending",
        timePrinted: Timestamp.fromDate(now),
        createdAt: serverTimestamp(),
        createdBy: currentUser,
      });

      setForm(EMPTY_FORM);
      alert(`✅ Double-check entry created for ${form.name.trim()} (${labName}).`);
    } catch (err) {
      console.error(err);
      alert("Error creating entry: " + (err?.message || err));
    } finally {
      setCreating(false);
    }
  };

  const updateLocalEntry = (uniqueId, field, value) => {
    setLocalBuffer((prev) => ({
      ...prev,
      [uniqueId]: {
        ...(prev[uniqueId] || {}),
        [field]: value,
      },
    }));
  };

  const clearLocal = (trackingId) => {
    setLocalBuffer((prev) => {
      const next = { ...prev };
      delete next[trackingId];
      return next;
    });
  };

  const handleCollect = async (entry) => {
    if (entry.isCollected || saving) return;
    try {
      setSaving(true);
      const trackingId = entry.uniqueTrackingId;
      const nowIso = new Date().toISOString();
      await setDoc(
        doc(db, DOUBLE_CHECK_COLLECTION, trackingId),
        {
          status: "Scanned",
          scannedStatus: "Yes",
          outsourcedCollectedTime: serverTimestamp(),
          collectedBy: currentUser,
          isCollected: true,
        },
        { merge: true }
      );
      updateLocalEntry(trackingId, "isCollected", true);
      updateLocalEntry(trackingId, "collectedBy", currentUser);
      updateLocalEntry(trackingId, "outsourcedCollectedTime", nowIso);
    } catch (err) {
      console.error(err);
      alert("Failed to collect sample.");
    } finally {
      setSaving(false);
    }
  };

  const handleReceived = async (entry) => {
    if (!entry.isCollected || entry.isReceived || saving) return;
    try {
      setSaving(true);
      const trackingId = entry.uniqueTrackingId;
      const buffered = bufferRef.current[trackingId] || {};
      await setDoc(
        doc(db, DOUBLE_CHECK_COLLECTION, trackingId),
        {
          concernedPerson:
            buffered.concernedPerson ?? entry.concernedPerson ?? "",
          relation: buffered.relation ?? entry.relation ?? "",
          mobileNo: buffered.mobileNo ?? entry.mobileNo ?? "",
          reportReceivedTime: serverTimestamp(),
          receivedBy: currentUser,
          receivedStatus: "Yes",
          isReceived: true,
        },
        { merge: true }
      );
      clearLocal(trackingId);
      alert(`Entry for ${entry.name} (${entry.labName}) Received`);
    } catch (err) {
      console.error(err);
      alert("Error saving data: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeliver = async (entry) => {
    if (!entry.isReceived || entry.isGiven || saving) return;
    const fieldsFilled =
      entry.concernedPerson?.trim() &&
      entry.relation?.trim() &&
      entry.mobileNo?.trim();
    if (!fieldsFilled) {
      alert("Fill Person, Relation, and Mobile before Deliver.");
      return;
    }
    try {
      setSaving(true);
      const trackingId = entry.uniqueTrackingId;
      await setDoc(
        doc(db, DOUBLE_CHECK_COLLECTION, trackingId),
        {
          isGiven: true,
          reportDeliveredTime: serverTimestamp(),
          deliveredBy: currentUser,
        },
        { merge: true }
      );
      clearLocal(trackingId);
      alert(`Report for ${entry.name} marked as Delivered`);
    } catch (err) {
      console.error(err);
      alert("Failed to deliver report.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="double-check-panel">
      <div className="double-check-create">
        <div className="double-check-create-title">
          Create Double Checking Entry
        </div>
        <div className="double-check-create-grid">
          <label>
            Reg No
            <input
              value={form.regNo}
              onChange={(e) => setField("regNo", e.target.value)}
              placeholder="Reg No"
            />
          </label>
          <label>
            Diagnostic No
            <input
              value={form.diagnosticNo}
              onChange={(e) => setField("diagnosticNo", e.target.value)}
              placeholder="Diagnostic No"
            />
          </label>
          <label>
            Name
            <input
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Patient name"
            />
          </label>
          <label>
            Doctor
            <input
              value={form.doctor}
              onChange={(e) => setField("doctor", e.target.value)}
              placeholder="Doctor"
            />
          </label>
          <label>
            Age
            <input
              type="number"
              value={form.age}
              onChange={(e) => setField("age", e.target.value)}
              placeholder="Age"
            />
          </label>
          <label>
            Age unit
            <select
              value={form.ageUnit}
              onChange={(e) => setField("ageUnit", e.target.value)}
            >
              <option value="years">years</option>
              <option value="months">months</option>
              <option value="days">days</option>
            </select>
          </label>
          <label>
            Source
            <select
              value={form.source}
              onChange={(e) => setField("source", e.target.value)}
            >
              <option value="OPD">OPD</option>
              <option value="IPD">IPD</option>
              <option value="Third Floor">Third Floor</option>
            </select>
          </label>
          <label>
            Lab
            <select
              value={form.labName}
              onChange={(e) => setField("labName", e.target.value)}
              required
            >
              <option value="" disabled>
                Select lab…
              </option>
              {LAB_OPTIONS.map((lab) => (
                <option key={lab} value={lab}>
                  {lab}
                </option>
              ))}
            </select>
          </label>
          <label className="double-check-tests">
            Test(s)
            <input
              value={form.tests}
              onChange={(e) => setField("tests", e.target.value)}
              placeholder="Comma-separated tests"
            />
          </label>
          <div className="double-check-create-actions">
            <button
              type="button"
              className="double-check-create-btn"
              disabled={!canCreate || creating}
              onClick={handleCreate}
            >
              {creating ? "Creating…" : "Create Entry"}
            </button>
          </div>
        </div>
      </div>

      <div className="table-container">
        <table className="backroom-table">
          <thead>
            <tr>
              <th className="sticky-col">Reg No</th>
              <th className="sticky-col">Diag No</th>
              <th className="sticky-col">Name</th>
              <th>Outsource Collected</th>
              <th>Age</th>
              <th>Test(s)</th>
              <th>Lab</th>
              <th>Doctor</th>
              <th>Person</th>
              <th>Relation</th>
              <th>Mobile</th>
              <th>Collected By</th>
              <th>Received By</th>
              <th>Delivered By</th>
              <th>TAT</th>
              <th>Sample</th>
              <th>Received</th>
              <th>Delivered</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const sTime = toTime(e.outsourcedCollectedTime);
              const rTime = toTime(e.reportReceivedTime);
              let tatDisplay = "—";
              if (sTime && rTime) {
                const diffMs = rTime - sTime;
                const totalMinutes = Math.floor(diffMs / 60000);
                const totalHours = Math.floor(totalMinutes / 60);
                tatDisplay =
                  totalHours >= 24
                    ? `${Math.floor(totalHours / 24)}d ${totalHours % 24}h`
                    : `${totalHours}h ${totalMinutes % 60}m`;
              }
              const isCollected = !!e.isCollected;
              const fieldsFilled =
                e.concernedPerson?.trim() &&
                e.relation?.trim() &&
                e.mobileNo?.trim();

              return (
                <tr
                  key={e.uniqueTrackingId}
                  className={
                    e.isGiven
                      ? "row-orange"
                      : e.isReceived
                        ? "row-green"
                        : e.isCollected
                          ? "row-yellow"
                          : ""
                  }
                >
                  <td className="sticky-col">{e.regNo}</td>
                  <td className="sticky-col">
                    {e.diagnosticNo || e.accessionNo || "—"}
                  </td>
                  <td className="sticky-col">{e.name}</td>
                  <td>
                    {sTime
                      ? sTime.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td>
                    {e.age} {e.ageUnit}
                  </td>
                  <td style={{ maxWidth: "180px" }}>
                    {(e.displayTests || e.selectedTests || [])
                      .map((t) => (typeof t === "string" ? t : t.test))
                      .join(", ") || "—"}
                  </td>
                  <td>
                    <span className="lab-badge">{e.labName}</span>
                  </td>
                  <td>{e.doctor || e.doctorName || "—"}</td>
                  <td>
                    <input
                      type="text"
                      className="table-input"
                      disabled={!isCollected || e.isGiven}
                      value={e.concernedPerson || ""}
                      onChange={(ev) =>
                        updateLocalEntry(
                          e.uniqueTrackingId,
                          "concernedPerson",
                          ev.target.value
                        )
                      }
                      placeholder="Name"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="table-input"
                      disabled={!isCollected || e.isGiven}
                      value={e.relation || ""}
                      onChange={(ev) =>
                        updateLocalEntry(
                          e.uniqueTrackingId,
                          "relation",
                          ev.target.value
                        )
                      }
                      placeholder="Relation"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="table-input"
                      disabled={!isCollected || e.isGiven}
                      value={e.mobileNo || ""}
                      onChange={(ev) =>
                        updateLocalEntry(
                          e.uniqueTrackingId,
                          "mobileNo",
                          ev.target.value
                        )
                      }
                      placeholder="Mobile"
                    />
                  </td>
                  <td>{e.collectedBy || "—"}</td>
                  <td>{e.receivedBy || "—"}</td>
                  <td>{e.deliveredBy || "—"}</td>
                  <td style={{ fontWeight: "bold", color: "#1e3a8a" }}>
                    {tatDisplay}
                  </td>
                  <td>
                    <button
                      className={`collect-btn ${isCollected ? "collected" : ""}`}
                      disabled={saving || isCollected}
                      onClick={() => handleCollect(e)}
                    >
                      {isCollected ? "Collected" : "Collect"}
                    </button>
                  </td>
                  <td>
                    <button
                      className="save-btn"
                      disabled={saving || !e.isCollected || e.isReceived}
                      onClick={() => handleReceived(e)}
                    >
                      {e.isReceived ? "Received" : "Mark Received"}
                    </button>
                  </td>
                  <td>
                    <button
                      className="given-btn"
                      disabled={
                        saving ||
                        !e.isReceived ||
                        e.isGiven ||
                        !fieldsFilled
                      }
                      onClick={() => handleDeliver(e)}
                    >
                      {e.isGiven ? "Delivered" : "Deliver"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length ? (
          <p className="double-check-empty">
            No double-check entries for this date range. Create one above.
          </p>
        ) : null}
      </div>
    </div>
  );
}
