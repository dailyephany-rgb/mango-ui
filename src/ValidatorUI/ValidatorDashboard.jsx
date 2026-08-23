import React, { useEffect, useMemo, useState } from "react";
import "./ValidatorDashboard.css";
import {
  collection,
  doc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  query,
  where,
  orderBy,
  Timestamp
} from "firebase/firestore";
import {
  trackedOnSnapshot as onSnapshot,
  trackedGetDoc as getDoc,
} from "../shared/firestore/trackedFirestore.js";

import { db } from "../firebaseConfig.js";
import ValidatorTable from "./ValidatorTable.jsx";
import UserMenu from "../auth/UserMenu";
import {
  COMPLETION_FIELDS,
  ROUTINE_DEPARTMENTS,
} from "../shared/config/collections.js";
import { useRegisterFilters } from "../shared/hooks/useRegisterFilters.js";
import {
  localDayStart,
  localDayEndExclusive,
} from "../shared/utils/dates.js";
import { applyReportDetailsStageToBatch } from "../shared/utils/routineStageFlags.js";
import { EngComponent } from "../engineering/ui/EngComponent.jsx";

function getActiveCollection(
  activeMainTab,
  activeSubTab,
  activeBackroomTab,
  activeBloodSubTab
) {
  if (activeMainTab === "biochem")
    return activeSubTab === "hormones" ? "hormones_main" : "biochemistry_register";
  if (activeMainTab === "coag") return "coagulation_register";
  if (activeMainTab === "haem") return "haematology_register";
  if (activeMainTab === "backroom") {
    if (activeBackroomTab === "esr") return "esr_register";
    if (activeBackroomTab === "blood")
      return activeBloodSubTab === "retesting"
        ? "bloodgroup_retesting_register"
        : "bloodgroup_testing_register";
    if (activeBackroomTab === "serology") return "serology_register";
    if (activeBackroomTab === "rapid") return "rapid_card_register";
    if (activeBackroomTab === "urine") return "urine_analysis_register";
  }
  return "";
}

export default function ValidatorDashboard() {
  const [activeMainTab, setActiveMainTab] = useState("biochem");
  const [activeSubTab, setActiveSubTab] = useState("main");
  const [activeBackroomTab, setActiveBackroomTab] = useState("esr");
  const [activeBloodSubTab, setActiveBloodSubTab] = useState("testing");

  const [rawData, setRawData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const { dateFrom, setDateFrom, dateTo, setDateTo } = useRegisterFilters();
  const loginMode = sessionStorage.getItem("loginMode") || "validator";

  const activeCollection = getActiveCollection(
    activeMainTab,
    activeSubTab,
    activeBackroomTab,
    activeBloodSubTab
  );

  // Listen only to the active dept register, scoped by timePrinted (same as dept tabs).
  useEffect(() => {
    if (!activeCollection) {
      setRawData([]);
      return undefined;
    }

    const start = localDayStart(dateFrom);
    const endExclusive = localDayEndExclusive(dateTo);
    if (!start || !endExclusive) {
      setRawData([]);
      return undefined;
    }

    const startTs = Timestamp.fromDate(start);
    const endTs = Timestamp.fromDate(endExclusive);

    const q = query(
      collection(db, activeCollection),
      where("timePrinted", ">=", startTs),
      where("timePrinted", "<", endTs),
      orderBy("timePrinted", "asc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setRawData(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
      },
      (err) => {
        console.error(
          `[Validator] ${activeCollection} timePrinted query failed:`,
          err
        );
        setRawData([]);
      }
    );

    return () => unsub();
  }, [activeCollection, dateFrom, dateTo]);

  const handleValidate = async (entry, collectionName) => {
    if (entry.validated) {
      return;
    }

    try {
      const ref = doc(db, collectionName, entry.id);
      const completionField = COMPLETION_FIELDS[collectionName];
      const reportRef = doc(db, "report_details", entry.id);
      const dept = ROUTINE_DEPARTMENTS[collectionName];

      const reportSnap = await getDoc(reportRef);
      const batch = writeBatch(db);

      batch.update(ref, {
        validated: true,
        validatedBy: sessionStorage.getItem("loggedUser") || "Unknown",
        validatedTime: serverTimestamp(),
        status: "validated",
      });

      const reportUpdates = {};

      if (
        completionField &&
        (!reportSnap.exists() || !reportSnap.data()[completionField])
      ) {
        reportUpdates[completionField] = serverTimestamp();
      }

      applyReportDetailsStageToBatch(
        batch,
        reportRef,
        reportSnap.exists(),
        dept,
        "validated",
        reportUpdates
      );

      await batch.commit();

      alert("Entry Validated Successfully!");
    } catch (err) {
      console.error("❌ Error during validation:", err);
      alert("Validation failed. Check console.");
    }
  };

  const handleEditResult = async (entry, collectionName, payload) => {
    if (!collectionName || !entry?.id || !payload) return;
    try {
      await updateDoc(doc(db, collectionName, entry.id), {
        ...payload,
        resultEditedBy: sessionStorage.getItem("loggedUser") || "Unknown",
        resultEditedTime: serverTimestamp(),
      });
      alert("Results updated.");
    } catch (err) {
      console.error("❌ Error editing results:", err);
      alert("Failed to update results. Check console.");
      throw err;
    }
  };

  const currentData = useMemo(() => {
    const s = searchTerm.toLowerCase().trim();
    if (!s) return rawData;

    return rawData.filter((item) => {
      const matchesReg = String(item.regNo || "").toLowerCase().includes(s);
      const matchesDiag = String(item.diagnosticNo || item.accessionNo || "")
        .toLowerCase()
        .includes(s);
      const matchesName = String(item.name || "").toLowerCase().includes(s);

      return matchesReg || matchesDiag || matchesName;
    });
  }, [rawData, searchTerm]);

  return (
    <EngComponent name="Validator.jsx" type="Page" parent={null}>
    <div className="validator-dashboard">
      <EngComponent name="Toolbar" type="Layout" parent="Validator.jsx">
      <div className="validator-header-row">
        <h2>🧪 Validator Interface</h2>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "15px",
          }}
        >
          <UserMenu />
        </div>
      </div>
      </EngComponent>

      <EngComponent name="Filters" type="Layout" parent="Validator.jsx">
      <div className="tab-container">
        {["biochem", "coag", "haem", "backroom"].map((tab) => (
          <button
            key={tab}
            className={`tab-btn ${activeMainTab === tab ? "active" : ""}`}
            onClick={() => setActiveMainTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeMainTab === "biochem" && (
        <div className="sub-tabs">
          <button
            className={`tab-btn ${activeSubTab === "main" ? "active" : ""}`}
            onClick={() => setActiveSubTab("main")}
          >
            Biochemistry — Main
          </button>
          <button
            className={`tab-btn ${activeSubTab === "hormones" ? "active" : ""}`}
            onClick={() => setActiveSubTab("hormones")}
          >
            Hormones — Main
          </button>
        </div>
      )}

      {activeMainTab === "backroom" && (
        <>
          <div className="sub-tabs">
            {["esr", "blood", "serology", "rapid", "urine"].map((id) => (
              <button
                key={id}
                className={`tab-btn ${activeBackroomTab === id ? "active" : ""}`}
                onClick={() => setActiveBackroomTab(id)}
              >
                {id.toUpperCase()} Register
              </button>
            ))}
          </div>

          {activeBackroomTab === "blood" && (
            <div className="inner-sub">
              <button
                className={`tab-btn ${activeBloodSubTab === "testing" ? "active" : ""}`}
                onClick={() => setActiveBloodSubTab("testing")}
              >
                Testing
              </button>
              <button
                className={`tab-btn ${activeBloodSubTab === "retesting" ? "active" : ""}`}
                onClick={() => setActiveBloodSubTab("retesting")}
              >
                Retesting
              </button>
            </div>
          )}
        </>
      )}
      </EngComponent>

      <EngComponent name="Main Register" type="Tables" parent="Validator.jsx">
      <ValidatorTable
        title={getTitle(
          activeMainTab,
          activeSubTab,
          activeBackroomTab,
          activeBloodSubTab
        )}
        data={currentData}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        loginMode={loginMode}
        onValidate={(entry) => handleValidate(entry, activeCollection)}
        onEditResult={(entry, payload) =>
          handleEditResult(entry, activeCollection, payload)
        }
      />
      </EngComponent>
    </div>
    </EngComponent>
  );
}

function getTitle(main, sub, backroom, bloodSub) {
  if (main === "biochem")
    return sub === "hormones"
      ? "Hormones — Main Analyzer"
      : "Biochemistry — Main Analyzer";
  if (main === "coag") return "Coagulation Register";
  if (main === "haem") return "Haematology Register";
  if (main === "backroom") {
    if (backroom === "esr") return "ESR Register";
    if (backroom === "blood")
      return `Blood Group — ${bloodSub.charAt(0).toUpperCase() + bloodSub.slice(1)}`;
    if (backroom === "serology") return "Serology Register";
    if (backroom === "rapid") return "Rapid Card Register";
    if (backroom === "urine") return "Urine Analysis Register";
  }
  return "Laboratory Register";
}
