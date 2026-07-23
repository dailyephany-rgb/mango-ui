
import React, { useEffect, useState } from "react";
import "./ValidatorDashboard.css";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  getDoc,
  writeBatch,
  serverTimestamp,
  Timestamp
} from "firebase/firestore";

import { db } from "../firebaseConfig.js";
import ValidatorTable from "./ValidatorTable.jsx";
import UserMenu from "../auth/UserMenu";

export default function ValidatorDashboard() {
  const [activeMainTab, setActiveMainTab] = useState("biochem");
  const [activeSubTab, setActiveSubTab] = useState("main");
  const [activeBackroomTab, setActiveBackroomTab] = useState("esr");
  const [activeBloodSubTab, setActiveBloodSubTab] = useState("testing");

  const [collections, setCollections] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const loginMode = sessionStorage.getItem("loginMode") || "validator";

  useEffect(() => {
    const unsubscribes = [];
    const collectionNames = [
      "biochemistry_register", "hormones_main", "biochem_backup",
      "hormones_backup", "coagulation_register", "haematology_register",
      "esr_register", "bloodgroup_testing_register", "bloodgroup_retesting_register",
      "serology_register", "rapid_card_register", "urine_analysis_register",
    ];

    collectionNames.forEach((col) => {
      const unsub = onSnapshot(collection(db, col), (snap) => {
        const docs = snap.docs.map((d) => ({ 
          id: d.id, // This is your Composite ID (e.g., 5501_A01)
          ...d.data() 
        }));
        setCollections((prev) => ({ ...prev, [col]: docs }));
      });
      unsubscribes.push(unsub);
    });
    return () => unsubscribes.forEach((u) => u());
  }, []);

  const parseEntryDate = (item) => {
    // Check all possible date fields used across departments
    const f = item.savedTime || item.timePrinted || item.timestamp || item.scannedTime;
    if (!f) return null;
    if (f instanceof Timestamp) return f.toDate();
    if (f.toDate) return f.toDate();
    if (f.seconds) return new Date(f.seconds * 1000);
    const d = new Date(f);
    return isNaN(d) ? null : d;
  };

  const COMPLETION_FIELDS = {
    biochemistry_register: "biochemistryCompletedAt",
    hormones_main: "hormonesCompletedAt",
    coagulation_register: "coagulationCompletedAt",
    haematology_register: "haematologyCompletedAt",
    esr_register: "esrCompletedAt",
    bloodgroup_testing_register: "bloodGroupCompletedAt",
    bloodgroup_retesting_register: "bloodGroupCompletedAt",
    serology_register: "serologyCompletedAt",
    rapid_card_register: "rapidCardCompletedAt",
    urine_analysis_register: "urineCompletedAt",
  };


  const ROUTINE_DEPARTMENTS = {
    biochemistry_register: "Bio-Chemistry",
    hormones_main: "Hormones",
    coagulation_register: "Coagulation",
    haematology_register: "Haematology",
    esr_register: "ESR",
    bloodgroup_testing_register: "Blood Group",
    bloodgroup_retesting_register: "Blood Group",
    serology_register: "Serology",
    rapid_card_register: "Rapid Card",
    urine_analysis_register: "Urine Analysis",
  };

  const handleValidate = async (entry, collectionName) => {
    try {
      // entry.id is the CompositeKey (e.g., "5501_A01")
      const ref = doc(db, collectionName, entry.id);
      await updateDoc(ref, {
        validated: true,
      
        validatedBy:
          sessionStorage.getItem("loggedUser") || "Unknown",
      
        validatedTime: serverTimestamp(),
      
        status: "validated",
      });

      const dept = ROUTINE_DEPARTMENTS[collectionName];

        if (dept) {
          await updateDoc(
            doc(db, "report_details", entry.id),
            {
              [`routineReportsValidated.${dept}`]: true,
            }
          );
        }

      
      alert("Entry Validated Successfully!");
    } catch (err) {
      console.error("❌ Error during validation:", err);
      alert("Validation failed. Check console.");
    }
  };


  const handleEntered = async (entry, collectionName) => {
    if (entry.entered) {
      return;
    }
  
    try {

      const ref = doc(db, collectionName, entry.id);

      const completionField = COMPLETION_FIELDS[collectionName];
      
      const reportRef = doc(db, "report_details", entry.id);

      const dept = ROUTINE_DEPARTMENTS[collectionName];

      console.log("ENTRY ID:", entry.id);
      console.log("REPORT DOC:", reportRef.path);
      
      const reportSnap = await getDoc(reportRef);

      console.log("Exists:", reportSnap.exists());

      if (reportSnap.exists()) {
        console.log(reportSnap.data());
      }

      console.log("Completion field:", completionField);
      
      const batch = writeBatch(db);
      
      // Update department register
      batch.update(ref, {
        entered: true,
        enteredBy:
          sessionStorage.getItem("loggedUser") || "Unknown",
        enteredTime: serverTimestamp(),
      });

      if (dept) {
        const enteredMap = {
          ...(reportSnap.data()?.routineReportsEntered || {}),
          [dept]: true,
        };
      
        batch.set(
          reportRef,
          {
            routineReportsEntered: enteredMap,
          },
          { merge: true }
        );
      }
      
      // Only write CompletedAt once
      if (
        completionField &&
        (
          !reportSnap.exists() ||
          !reportSnap.data()[completionField]
        )
      ) {
        batch.set(
          reportRef,
          {
            [completionField]: serverTimestamp(),
          },
          { merge: true }
        );
      }
      
      await batch.commit();
  
      alert("Marked as Entered!");
    } catch (err) {
      console.error("❌ Error during entry:", err);
      alert("Failed to mark as Entered.");
    }
  };

  const getCollectionName = () => {
    if (activeMainTab === "biochem")
      return activeSubTab === "hormones" ? "hormones_main" : "biochemistry_register";
    if (activeMainTab === "backup")
      return activeSubTab === "hormoneBackup" ? "hormones_backup" : "biochem_backup";
    if (activeMainTab === "coag") return "coagulation_register";
    if (activeMainTab === "haem") return "haematology_register";
    if (activeMainTab === "backroom") {
      if (activeBackroomTab === "esr") return "esr_register";
      if (activeBackroomTab === "blood")
        return activeBloodSubTab === "retesting" ? "bloodgroup_retesting_register" : "bloodgroup_testing_register";
      if (activeBackroomTab === "serology") return "serology_register";
      if (activeBackroomTab === "rapid") return "rapid_card_register";
      if (activeBackroomTab === "urine") return "urine_analysis_register";
    }
    return "";
  };

  const activeCollection = getCollectionName();
  const rawData = collections[activeCollection] || [];

  const currentData = rawData.filter((item) => {

    const s = searchTerm.toLowerCase().trim();
    if (!s) return true;
    
    // Search by RegNo, DiagNo, or the Name
    const matchesReg = String(item.regNo || "").toLowerCase().includes(s);
    const matchesDiag = String(item.diagnosticNo || item.accessionNo || "").toLowerCase().includes(s);
    const matchesName = String(item.name || "").toLowerCase().includes(s);
    
    return matchesReg || matchesDiag || matchesName;
  });

          return (
            <div className="validator-dashboard">
            
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


      <div className="tab-container">
        {["biochem", "backup", "coag", "haem", "backroom"].map((tab) => (
          <button key={tab} className={`tab-btn ${activeMainTab === tab ? "active" : ""}`} onClick={() => setActiveMainTab(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeMainTab === "biochem" && (
        <div className="sub-tabs">
          <button className={`tab-btn ${activeSubTab === "main" ? "active" : ""}`} onClick={() => setActiveSubTab("main")}>Biochemistry — Main</button>
          <button className={`tab-btn ${activeSubTab === "hormones" ? "active" : ""}`} onClick={() => setActiveSubTab("hormones")}>Hormones — Main</button>
        </div>
      )}

      {activeMainTab === "backroom" && (
        <>
          <div className="sub-tabs">
            {["esr", "blood", "serology", "rapid", "urine"].map((id) => (
              <button key={id} className={`tab-btn ${activeBackroomTab === id ? "active" : ""}`} onClick={() => setActiveBackroomTab(id)}>
                {id.toUpperCase()} Register
              </button>
            ))}
          </div>

          {activeBackroomTab === "blood" && (
            <div className="inner-sub">
              <button className={`tab-btn ${activeBloodSubTab === "testing" ? "active" : ""}`} onClick={() => setActiveBloodSubTab("testing")}>Testing</button>
              <button className={`tab-btn ${activeBloodSubTab === "retesting" ? "active" : ""}`} onClick={() => setActiveBloodSubTab("retesting")}>Retesting</button>
            </div>
          )}
        </>
      )}

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
              loginMode={loginMode}
              onValidate={(entry) =>handleValidate(entry, activeCollection)}
              onEntered={(entry) =>handleEntered(entry, activeCollection)}
            />
    </div>
  );
}

function getTitle(main, sub, backroom, bloodSub) {
  if (main === "biochem") return sub === "hormones" ? "Hormones — Main Analyzer" : "Biochemistry — Main Analyzer";
  if (main === "coag") return "Coagulation Register";
  if (main === "haem") return "Haematology Register";
  if (main === "backroom") {
    if (backroom === "esr") return "ESR Register";
    if (backroom === "blood") return `Blood Group — ${bloodSub.charAt(0).toUpperCase() + bloodSub.slice(1)}`;
    if (backroom === "serology") return "Serology Register";
    if (backroom === "rapid") return "Rapid Card Register";
    if (backroom === "urine") return "Urine Analysis Register";
  }
  return "Laboratory Register";
}