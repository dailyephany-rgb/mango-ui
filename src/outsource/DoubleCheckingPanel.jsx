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
import testMapping from "../test_mapping.json";
import {
  parseEntryDate,
  getLocalDateString,
  localDayStart,
  localDayEndExclusive,
} from "../shared/utils/dates.js";
import { usePersistedObjectState } from "../shared/hooks/usePersistedObjectState.js";
import {
  EMPTY_DEPT_COL_FILTERS,
  applyDeptColFilters,
  hasActiveDeptColFilters,
} from "../shared/utils/deptColFilters.js";
import ColFilterToggle, {
  ColFilterInput,
  ColFilterLocked,
  ColFilterClearCell,
} from "../shared/components/ColFilterToggle.jsx";
import "../shared/styles/colFilters.css";

export const DOUBLE_CHECK_TAB = "Double Checking";
export const DOUBLE_CHECK_COLLECTION = "double_check_outsource";

const LAB_OPTIONS = Object.keys(OUTSOURCE_MAP);
const OUTSOURCE_DEPT_KEYS = new Set(LAB_OPTIONS);

/** Clinical + inside-lab depts only (exclude STERLING / NEUBERG / …). */
const CLINICAL_INSIDE_DEPTS = Object.keys(testMapping).filter(
  (dept) => !OUTSOURCE_DEPT_KEYS.has(dept)
);

const OUTSOURCE_PREFIX = "(outsource) ";

function withOutsourcePrefix(testName) {
  return `${OUTSOURCE_PREFIX}${testName}`;
}

/** Catalog for search: original names from mapping, shown with (outsource) prefix. */
const DOUBLE_CHECK_TEST_CATALOG = CLINICAL_INSIDE_DEPTS.flatMap((dept) => {
  const names = testMapping[dept] || [];
  const seen = new Set();
  return names
    .filter((t) => {
      const key = String(t).toUpperCase().trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((test) => ({
      dept,
      originalTest: test,
      test: withOutsourcePrefix(test),
    }));
});

/** Same doctor list as mango.jsx */
const DOCTOR_OPTIONS = [
  "Dr. Anil Sharma",
  "Dr. Renu Makwana",
  "Dr. Sanjay Makwana",
  "Dr. Kapil Kumar Raheja",
  "Dr. Vivek Lakhawat",
  "Sanjeev Sanghvi",
  "Dr. Akhil Govil",
  "Dr. Jitendra Chouhan",
  "Dr. Jitendra Khetawat",
  "Dr. Ashish Joshi",
  "RMO (Redidential Medical Officer)",
  "Dr. Ashok Bishnoi",
  "Consultant Gynaecology",
  "Consultant ART",
  "Consultant Paediatrician",
  "Consultant Orthopaedic",
  "Dr. Vinod Shaily",
  "Dr. Dabi",
  "Dr. Saurabh Kuvera",
  "Dr. Pravesh Vyas",
  "Dr. Neha Agarwal",
  "Dr. Jyotsana Sharma",
  "Dr. Lalit Mohan Rathi",
  "Dr. Amit Singhvi",
  "Dr. Consultant Obstretrics",
];

const EMPTY_FORM = {
  regNo: "",
  diagnosticNo: "",
  name: "",
  doctor: "",
  age: "",
  ageUnit: "years",
  source: "OPD",
  selectedTests: [],
  labName: "",
};

function buildDocId(regNo, diagnosticNo, labName) {
  const labSlug = String(labName || "").replace(/\s+/g, "");
  return `${String(regNo).trim()}_${String(diagnosticNo).trim()}_${labSlug}_DOUBLECHECK`;
}

function toTime(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function testLabel(t) {
  if (typeof t === "string") return t;
  return t?.test || "";
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
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [showColFilters, setShowColFilters] = useState(false);
  const [colFilters, setColFilters] = useState(EMPTY_DEPT_COL_FILTERS);
  const searchRef = useRef(null);
  const resultRefs = useRef([]);

  const [localBuffer, setLocalBuffer] = usePersistedObjectState(
    "double_check_localBuffer",
    {}
  );
  const bufferRef = useRef(localBuffer);
  useEffect(() => {
    bufferRef.current = localBuffer;
  }, [localBuffer]);

  useEffect(() => {
    if (focusedIndex >= 0 && resultRefs.current[focusedIndex]) {
      resultRefs.current[focusedIndex].scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [focusedIndex]);

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

  const setColFilter = (key, value) => {
    setColFilters((prev) => ({ ...prev, [key]: value }));
  };
  const clearColFilters = () => setColFilters(EMPTY_DEPT_COL_FILTERS);
  const hasActiveColFilters = hasActiveDeptColFilters(colFilters);

  const filtered = useMemo(() => {
    const merged = rows.map((e) => ({
      ...e,
      ...(localBuffer[e.uniqueTrackingId] || {}),
    }));
    const base = merged
      .filter((e) => {
        if (activeSource !== "All" && e.source !== activeSource) return false;
        if (regSearch.trim()) {
          const s = regSearch.trim().toLowerCase();
          const regKey = String(e.regNo || "").toLowerCase();
          const accKey = String(
            e.diagnosticNo || e.accessionNo || ""
          ).toLowerCase();
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
    return applyDeptColFilters(base, colFilters, {
      getDiag: (p) => p.diagnosticNo || p.accessionNo || "",
      getTests: (p) =>
        (p.displayTests || p.selectedTests || [])
          .map((t) => testLabel(t))
          .filter(Boolean)
          .join(" "),
    });
  }, [rows, localBuffer, activeSource, regSearch, colFilters]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchText(value);
    setFocusedIndex(-1);
    if (!value.trim()) {
      setSearchResults([]);
      return;
    }
    const lower = value.toLowerCase();
    // Match like mango: startsWith on the original clinical/inside-lab name
    const results = DOUBLE_CHECK_TEST_CATALOG.filter((t) =>
      t.originalTest.toLowerCase().startsWith(lower)
    );
    setSearchResults(results.slice(0, 50));
  };

  const handleSelectSearchTest = (item) => {
    setForm((prev) => {
      const exists = prev.selectedTests.some(
        (t) => t.dept === item.dept && t.test === item.test
      );
      if (exists) return prev;
      return {
        ...prev,
        selectedTests: [
          ...prev.selectedTests,
          {
            dept: item.dept,
            test: item.test,
            originalTest: item.originalTest,
          },
        ],
      };
    });
    setSearchText("");
    setSearchResults([]);
    setFocusedIndex(-1);
    searchRef.current?.focus();
  };

  const handleSearchKeyDown = (e) => {
    if (searchResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) =>
        prev < searchResults.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item =
        focusedIndex >= 0 ? searchResults[focusedIndex] : searchResults[0];
      if (item) handleSelectSearchTest(item);
    }
  };

  const handleRemoveSelectedTest = (index) => {
    setForm((prev) => ({
      ...prev,
      selectedTests: prev.selectedTests.filter((_, i) => i !== index),
    }));
  };

  const canCreate =
    form.regNo.trim() &&
    form.diagnosticNo.trim() &&
    form.name.trim() &&
    form.labName &&
    form.selectedTests.length > 0;

  const handleCreate = async () => {
    if (!canCreate || creating) return;
    const regNo = form.regNo.trim();
    const diagnosticNo = form.diagnosticNo.trim();
    const labName = form.labName;
    const selectedTests = form.selectedTests.map((t) => ({
      dept: t.dept,
      test: t.test,
      originalTest: t.originalTest || t.test,
    }));
    const testNames = selectedTests.map((t) => t.test);
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
        tests: testNames,
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
      setSearchText("");
      setSearchResults([]);
      alert(`✅ Double-check entry created for ${form.name.trim()} (${labName}).`);
    } catch (err) {
      console.error(err);
      alert("Error creating entry: " + (err?.message || err));
    } finally {
      setCreating(false);
    }
  };

  const updateLocalEntry = (uniqueId, field, value) => {
    setLocalBuffer((prev) => {
      const next = {
        ...prev,
        [uniqueId]: {
          ...(prev[uniqueId] || {}),
          [field]: value,
        },
      };
      bufferRef.current = next;
      return next;
    });
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
            <select
              value={form.doctor}
              onChange={(e) => setField("doctor", e.target.value)}
            >
              <option value="">Select Doctor</option>
              {DOCTOR_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
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
            Search Tests
            <div className="dc-search-wrapper">
              <input
                ref={searchRef}
                type="text"
                placeholder="Type to search (e.g. L)…"
                value={searchText}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
              />
              {searchResults.length > 0 && (
                <div className="dc-search-results-box">
                  {searchResults.map((item, i) => (
                    <div
                      key={`${item.dept}-${item.originalTest}-${i}`}
                      ref={(el) => {
                        resultRefs.current[i] = el;
                      }}
                      className={`dc-search-result-item ${
                        i === focusedIndex ? "focused" : ""
                      }`}
                      onClick={() => handleSelectSearchTest(item)}
                    >
                      <strong>{item.test}</strong>
                      <span>({item.dept})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
        {form.selectedTests.length > 0 ? (
          <div className="dc-selected-tests">
            <div className="dc-selected-tests-title">Selected tests</div>
            <ul>
              {form.selectedTests.map((t, i) => (
                <li key={`${t.dept}-${t.test}-${i}`}>
                  <span>
                    {t.test} <em>({t.dept})</em>
                  </span>
                  <button
                    type="button"
                    className="dc-remove-test"
                    onClick={() => handleRemoveSelectedTest(i)}
                    aria-label="Remove test"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="table-container">
        <table className="backroom-table">
          <thead>
            <tr>
              <th className="sticky-col">Reg No</th>
              <th className="sticky-col">Diag No</th>
              <th className="sticky-col">
                <ColFilterToggle
                  label="Name"
                  open={showColFilters}
                  active={hasActiveColFilters}
                  onToggle={() => setShowColFilters((v) => !v)}
                />
              </th>
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
            {showColFilters ? (
              <tr className="col-filter-row">
                <ColFilterInput
                  value={colFilters.regNo}
                  onChange={(v) => setColFilter("regNo", v)}
                  placeholder="Filter reg…"
                />
                <ColFilterInput
                  value={colFilters.diagnosticNo}
                  onChange={(v) => setColFilter("diagnosticNo", v)}
                  placeholder="Filter diag…"
                />
                <ColFilterInput
                  value={colFilters.name}
                  onChange={(v) => setColFilter("name", v)}
                  placeholder="Filter name…"
                />
                <ColFilterLocked />
                <ColFilterInput
                  value={colFilters.age}
                  onChange={(v) => setColFilter("age", v)}
                  placeholder="Filter age…"
                />
                <ColFilterInput
                  value={colFilters.tests}
                  onChange={(v) => setColFilter("tests", v)}
                  placeholder="e.g. culture"
                />
                <ColFilterInput
                  value={colFilters.lab}
                  onChange={(v) => setColFilter("lab", v)}
                  placeholder="e.g. STERLING"
                />
                <ColFilterInput
                  value={colFilters.doctor}
                  onChange={(v) => setColFilter("doctor", v)}
                  placeholder="Filter doctor…"
                />
                <ColFilterInput
                  value={colFilters.person}
                  onChange={(v) => setColFilter("person", v)}
                  placeholder="Filter person…"
                />
                <ColFilterInput
                  value={colFilters.relation}
                  onChange={(v) => setColFilter("relation", v)}
                  placeholder="Filter relation…"
                />
                <ColFilterInput
                  value={colFilters.mobile}
                  onChange={(v) => setColFilter("mobile", v)}
                  placeholder="Filter mobile…"
                />
                <ColFilterInput
                  value={colFilters.collectedBy}
                  onChange={(v) => setColFilter("collectedBy", v)}
                  placeholder="Filter collected by…"
                />
                <ColFilterInput
                  value={colFilters.receivedBy}
                  onChange={(v) => setColFilter("receivedBy", v)}
                  placeholder="Filter received by…"
                />
                <ColFilterInput
                  value={colFilters.deliveredBy}
                  onChange={(v) => setColFilter("deliveredBy", v)}
                  placeholder="Filter delivered by…"
                />
                <ColFilterLocked />
                <ColFilterLocked />
                <ColFilterLocked />
                <ColFilterClearCell
                  show={hasActiveColFilters}
                  onClear={clearColFilters}
                />
              </tr>
            ) : null}
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
                      .map((t) => testLabel(t))
                      .filter(Boolean)
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
