
import React, { useState, useEffect, useMemo, memo } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  setDoc,
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { trackedOnSnapshot as onSnapshot } from "../shared/firestore/trackedFirestore.js";
import "./Backroom.css";
import {
  parseEntryDate,
  getLocalDateString,
  localDayStart,
  localDayEndExclusive,
} from "../shared/utils/dates.js";
import { normalizeSource } from "../shared/utils/source.js";
import VirtualizedTableBody from "../shared/components/VirtualizedTableBody.jsx";
import { EngTelemetry } from "../engineering/telemetry/EngTelemetry.js";
import { isEngTelemetryEnabled } from "../engineering/telemetry/killSwitch.js";
import { filterAndSortRegisterPatients } from "../shared/utils/filterRegisterPatients.js";
import { usePersistedObjectState } from "../shared/hooks/usePersistedObjectState.js";
import { useRegisterFilters } from "../shared/hooks/useRegisterFilters.js";
import { useScopedMasterEntries } from "../shared/hooks/useScopedMasterEntries.js";
import { useStableCallback } from "../shared/hooks/useStableCallback.js";
import {
  arePatientRowEqual,
  DEPT_REGISTER_ROW_FIELDS,
} from "../shared/utils/arePatientRowEqual.js";
import RegisterFilterBar from "../shared/components/RegisterFilterBar.jsx";



const tableFixStyles = `
.table-scroll-container {
  width: 100%;
  overflow-x: auto;
  overflow-y: auto;
  max-height: 80vh;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  position: relative;
}
.backroom-table {
  width: 100%;
  min-width: 1200px; 
  border-collapse: separate; 
  border-spacing: 0;
}
`;

export default function BloodGroupRegister() {
  const [testingDocs, setTestingDocs] = useState({});
  const [retestingDocs, setRetestingDocs] = useState({});
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("testing");

  // Observer-only: mark retesting sub-view for Component Timeline
  useEffect(() => {
    if (!isEngTelemetryEnabled()) return undefined;
    if (activeTab !== "retesting") return undefined;
    EngTelemetry.componentMount({
      name: "Blood Group Retesting",
      type: "Tables",
      parent: "Backroom.jsx",
    });
    return () => EngTelemetry.componentUnmount("Blood Group Retesting");
  }, [activeTab]);

  // 🛡️ INTERNAL BUFFER: Shields dropdown selections from cloud sync wipes
  const [localResults, setLocalResults] = usePersistedObjectState("bloodgroup_localResults", {});

  const {
    regSearch,
    setRegSearch,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    sourceFilter,
    setSourceFilter,
  } = useRegisterFilters();

  const { masterEntries } = useScopedMasterEntries({
    masterDeptKey: "Blood-Group",
    dateFrom,
    dateTo,
  });

  // UPDATE: Load localScans from LocalStorage to survive refresh
  const [localScans, setLocalScans] = usePersistedObjectState("bloodgroup_localScans", {});
  
  // FINAL FIX: Persist localScanTimes to survive refresh
  const [localScanTimes, setLocalScanTimes] = usePersistedObjectState("bloodgroup_localScanTimes", {});

  useEffect(() => {
    const fromStr = dateFrom || getLocalDateString();
    const toStr = dateTo || getLocalDateString();
    const start = localDayStart(fromStr);
    const endExclusive = localDayEndExclusive(toStr);
    if (!start || !endExclusive) return undefined;

    const startTs = Timestamp.fromDate(start);
    const endTs = Timestamp.fromDate(endExclusive);

    // Only listen to the active tab collection — pause the other to avoid stacking
    if (activeTab === "testing") {
      const testingQuery = query(
        collection(db, "bloodgroup_testing_register"),
        where("timePrinted", ">=", startTs),
        where("timePrinted", "<", endTs),
        orderBy("timePrinted", "asc")
      );
      const unsubTesting = onSnapshot(
        testingQuery,
        (snap) => {
          const data = {};
          snap.docs.forEach((d) => {
            data[d.id] = d.data();
          });
          setTestingDocs(data);
        },
        (err) => {
          console.error("[BloodGroup] testing_register timePrinted query failed:", err);
        }
      );
      return () => unsubTesting();
    }

    const retestingQuery = query(
      collection(db, "bloodgroup_retesting_register"),
      where("timePrinted", ">=", startTs),
      where("timePrinted", "<", endTs),
      orderBy("timePrinted", "asc")
    );
    const unsubRetesting = onSnapshot(
      retestingQuery,
      (snap) => {
        const data = {};
        snap.docs.forEach((d) => {
          data[d.id] = d.data();
        });
        setRetestingDocs(data);
      },
      (err) => {
        console.error("[BloodGroup] retesting_register timePrinted query failed:", err);
      }
    );
    return () => unsubRetesting();
  }, [dateFrom, dateTo, activeTab]);

  const allMergedData = useMemo(() => {
    const bloodRows = masterEntries.filter(e =>
      Array.isArray(e.selectedTests) &&
      e.selectedTests.some(t =>
        (typeof t === "string" ? t : t?.test || "").toLowerCase().includes("abo group")
      )
    );

    return bloodRows.map(entry => {
      const reg = String(entry.regNo || entry.id);
      const diag = entry.diagnosticNo || entry.accNo || "—";
      // UPDATE: Composite key for unique identification
      const compositeKey = `${reg}_${diag}`;

      const base = {
        ...entry,
        regNo: reg,
        diagnosticNo: diag,
        compositeKey: compositeKey,
        source: normalizeSource(entry.source),
        bloodGroup: "",
        rhFactor: "",
        result: "",
        scanned: "No",
        saved: "No",
        status: "pending",
        urgent: entry.urgent || false,
        timePrinted: entry.timePrinted ?? null,
        timeCollected: entry.timeCollected ?? null,
      };

      const build = (storedData, tab) => {
        // Tracker uses tab + compositeKey
        const scanKey = `${tab}_${compositeKey}`;
        const typing = localResults[scanKey] || {}; 
        
        let row = { ...base, ...storedData, ...typing };
        row.scanned = localScans[scanKey] ?? row.scanned ?? "No";
        row.status = row.saved === "Yes" ? "saved" : row.scanned === "Yes" ? "scanned" : "pending";
        
        if (row.bloodGroup && row.rhFactor) {
            row.result = `${row.bloodGroup} ${row.rhFactor === "Positive" ? "+" : "-"}`;
        }

        return row;
      };

      return {
        testingData: build(testingDocs[compositeKey] || {}, "testing"),
        retestingData: build(retestingDocs[compositeKey] || {}, "retesting")
      };
    });
  }, [masterEntries, testingDocs, retestingDocs, localScans, localResults]);

  const activeEntries = useMemo(() => 
    allMergedData.map(m => activeTab === "testing" ? m.testingData : m.retestingData)
  , [allMergedData, activeTab]);

  const handleChange = (tab, compositeKey, field, value) => {
    const key = `${tab}_${compositeKey}`;
  
    setLocalResults(prev => {
      const updated = {
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          [field]: value
        }
      };
  
      return updated;
    });
  };

  // UPDATE: Writes both Scan status and Time to LocalStorage using compositeKey
 
  const handleScan = async (tab, entry, value) => {
    const key = `${tab}_${entry.compositeKey}`;
    const now = new Date().toISOString();
  
    setLocalScans((p) => {
      const updated = { ...p, [key]: value };
      return updated;
    });
  
    setLocalScanTimes((p) => {
      const updatedTimes = {
        ...p,
        [key]: value === "Yes" ? now : null,
      };
  
      return updatedTimes;
    });
  
    // Only Testing updates report_details
    if (tab === "testing") {
      try {
        await updateDoc(
          doc(db, "report_details", entry.compositeKey),
          {
            [`routineReportsScanned.Blood Group`]:
              value === "Yes",
          }
        );
      } catch (err) {
        console.error(
          "Failed to update scan status:",
          err
        );
      }
    }
  };

  const handleSave = async (tab, entry) => {
    try {
      setSaving(true);
      const compositeKey = entry.compositeKey;
      const key = `${tab}_${compositeKey}`;

      if (entry.scanned !== "Yes") {
        alert("Please scan before saving");
        return;
      }
      if (!entry.bloodGroup || !entry.rhFactor) {
        alert("Fill Blood Group & Rh Factor");
        return;
      }

      const rawLocalTime = localScanTimes[key];
      const scanTime = rawLocalTime ? new Date(rawLocalTime) : null;

      const filteredTests = (entry.selectedTests || [])
        .map((t) => (typeof t === "string" ? t : t?.test || ""))
        .filter((testName) => testName.toLowerCase().includes("abo group"));

        const dbPayload = {
          regNo: entry.regNo,
          compositeKey,
          diagnosticNo: entry.diagnosticNo || "—",
        
          name: entry.name || "",
          age: entry.age || "",
          ageUnit: entry.ageUnit || "",
          gender: entry.gender || "-",
        
          source: entry.source || "-",
          category: entry.category || "-",
        
          selectedTests: filteredTests,
        
          bloodGroup: entry.bloodGroup || "",
          rhFactor: entry.rhFactor || "",
          result: entry.result || "",
        
          scanned: "Yes",
          scannedTime: scanTime
            ? Timestamp.fromDate(scanTime)
            : (entry.scannedTime || null),
        
          saved: "Yes",
          savedTime: serverTimestamp(),
          savedBy: sessionStorage.getItem("loggedUser") || "Unknown",
        
          timeCollected: entry.timeCollected ?? null,
          timePrinted: entry.timePrinted ?? null,
        
          status: "saved",
          type: tab,
        };
        
      const col = tab === "testing" ? "bloodgroup_testing_register" : "bloodgroup_retesting_register";

      // Save using compositeKey
      await setDoc(doc(db, col, compositeKey), dbPayload, { merge: true });

      if (tab === "testing") {
        await updateDoc(
          doc(db, "report_details", compositeKey),
          {
            [`routineReportsScanned.Blood Group`]: true,
            [`routineReportsSaved.Blood Group`]: true,
          }
        );
      }

      
      setLocalResults(prev => {
        const n = { ...prev };
        delete n[key];
      
        return n;
      });
      
      // UPDATE: Cleanup LocalStorage after save
      setLocalScans(p => { 
        const n = {...p}; 
        delete n[key];
        return n; 
      });

      setLocalScanTimes(p => {
        const n = {...p};
        delete n[key];
        return n;
      });
      
      alert(`Saved ${tab} entry for ${entry.name}`);
    } catch (err) {
      console.error(err);
      alert("Error saving data");
    } finally {
      setSaving(false);
    }
  };

  const filteredEntries = useMemo(() => {
    const entriesWithDate = activeEntries.filter((p) => parseEntryDate(p));
    return filterAndSortRegisterPatients(entriesWithDate, {
      regSearch,
      sourceFilter,
      dateFrom,
      dateTo,
      getDiag: (p) => p.diagnosticNo || p.accessionNo || "",
    });
  }, [activeEntries, regSearch, sourceFilter, dateFrom, dateTo]);

  const onChange = useStableCallback((tab, key, field, value) => {
    handleChange(tab, key, field, value);
  });
  const onScan = useStableCallback((tab, entry, value) => {
    handleScan(tab, entry, value);
  });
  const onSave = useStableCallback((tab, entry) => {
    handleSave(tab, entry);
  });

  return (
    <div className="register-section">
      <style>{tableFixStyles}</style>
      <h3>🩸 Blood Group & Rh Type Register</h3>

      <RegisterFilterBar
            regSearch={regSearch}
            setRegSearch={setRegSearch}
            dateFrom={dateFrom}
            setDateFrom={setDateFrom}
            dateTo={dateTo}
            setDateTo={setDateTo}
            sourceFilter={sourceFilter}
            setSourceFilter={setSourceFilter}
          />

      <div className="tab-container">
        {["testing", "retesting"].map(tab => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="table-scroll-container">
        <table className="backroom-table">
          <thead>
            <tr>
              <th className="sticky-col">Reg No</th>
              <th className="sticky-col">Diag No</th>
              <th className="sticky-col">Name</th>
              <th>Age</th>
              <th>Gender</th>
              <th>Source</th>
              <th>Blood Group</th>
              <th>Rh</th>
              <th>Result</th>
              <th>Scanned</th>
              <th>Saved By</th>
              <th>Action</th>
            </tr>
          </thead>
          <VirtualizedTableBody
            items={filteredEntries}
            columnCount={12}
            renderRow={(e) => (
              <BloodGroupRegisterRow
                key={`${e.compositeKey}_${activeTab}`}
                patient={e}
                activeTab={activeTab}
                saving={saving}
                onChange={onChange}
                onScan={onScan}
                onSave={onSave}
              />
            )}
          />
        </table>
      </div>
    </div>
  );
}

const BLOOD_GROUPS = ["A", "B", "AB", "O"];
const RH_FACTORS = ["Positive", "Negative"];

const BloodGroupRegisterRow = memo(function BloodGroupRegisterRow({
  patient: e,
  activeTab,
  saving,
  onChange,
  onScan,
  onSave,
}) {
  return (
    <tr
      className={
        e.saved === "Yes" ? "row-green" : e.scanned === "Yes" ? "row-yellow" : ""
      }
    >
      <td
        className="sticky-col"
        style={e.urgent ? { borderLeft: "4px solid red" } : {}}
      >
        {e.regNo}
      </td>
      <td className="sticky-col" style={{ color: "#475569" }}>
        {e.diagnosticNo}
      </td>
      <td className="sticky-col">{e.name}</td>
      <td>{e.age}</td>
      <td>{e.gender}</td>
      <td>{e.source}</td>
      <td>
        <select
          value={e.bloodGroup}
          disabled={e.scanned !== "Yes" || e.saved === "Yes"}
          onChange={(ev) =>
            onChange(activeTab, e.compositeKey, "bloodGroup", ev.target.value)
          }
        >
          <option value="">Select</option>
          {BLOOD_GROUPS.map((bg) => (
            <option key={bg}>{bg}</option>
          ))}
        </select>
      </td>
      <td>
        <select
          value={e.rhFactor}
          disabled={e.scanned !== "Yes" || e.saved === "Yes"}
          onChange={(ev) =>
            onChange(activeTab, e.compositeKey, "rhFactor", ev.target.value)
          }
        >
          <option value="">Select</option>
          {RH_FACTORS.map((rh) => (
            <option key={rh}>{rh}</option>
          ))}
        </select>
      </td>
      <td>{e.result}</td>
      <td>
        <select
          value={e.scanned}
          disabled={e.saved === "Yes"}
          onChange={(ev) => onScan(activeTab, e, ev.target.value)}
        >
          <option value="No">No</option>
          <option value="Yes">Yes</option>
        </select>
      </td>
      <td style={{ minWidth: "130px", fontWeight: "600", color: "#1e3a8a" }}>
        {e.savedBy || "—"}
      </td>
      <td>
        <button
          className="save-btn"
          disabled={e.saved === "Yes" || saving}
          onClick={() => onSave(activeTab, e)}
        >
          Save
        </button>
      </td>
    </tr>
  );
}, arePatientRowEqual(DEPT_REGISTER_ROW_FIELDS));
