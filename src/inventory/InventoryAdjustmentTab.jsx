
import React, { useEffect, useState } from "react";
import {
  collection,
  doc,
  serverTimestamp,
  writeBatch
} from "firebase/firestore";
import { trackedGetDocs as getDocs } from "../shared/firestore/trackedFirestore.js";

import { db } from "../firebaseConfig";
import { setStaticConfig } from "../shared/cache/staticConfigCache.js";

const biochemTests = [
  "ALBUMIN,SERUM",
  "ALKALINE PHOSPHATASE,SERUM",
  "BILIRUBIN(TOTAL,DIRECT & INDIRECT),SERUM",
  "BLOOD GLUCOSE OGT",
  "BLOOD UREA,SERUM",
  "CREATININE,SERUM",
  "CRP(C-REACTIVE PROTEIN,SERUM QUANTITATIVE)",
  "ELECTROLYTES,SERUM",
  "G.G.T(GAMMA GLUTAMYL TRANSFERASE,SERUM)",
  "GLUCOSE FASTING,PLASMA",
  "GLUCOSE POST - PRANDIAL( P.P. ),PLASMA",
  "GLUCOSE RANDOM,PLASMA",
  "LACTATE DEHYDROGENASE,SERUM",
  "LFT (LIVER FUNCTION TEST)",
  "ORAL GLUCOSE TOLERANCE TEST(OGTT)",
  "PHOSPHORUS,SERUM",
  "POTASSIUM,SERUM",
  "RFT(RENAL FUNCTION TEST)",
  "SGOT(ASPARTATE AMINOTRANSFERASE,SERUM)",
  "SGPT(ALANINE AMINOTRANSFERASE,SERUM)",
  "SODIUM,SERUM",
  "TOTAL PROTEIN,SERUM",
  "TRIGLYCERIDES,SERUM",
  "URIC ACID, SERUM",
];

const hormoneTests = [
  "BETA-HCG (HUMAN CHORIONIC GONADOTROPIN)",
  "FERRITIN",
  "FT4 (FREE THYROXINE)",
  "LH (LUTEINIZING HORMONE)",
  "PROLACTIN",
  "T3",
  "T4",
  "TSH (THYROID STIMULATING HORMONE)",
  "PROGESTERONE",
  "VITAMIN D25 (OH) TOTAL",
  "VITAMIN B12 LEVEL",
  "PSA", 
];

function mapAdjustmentSnap(snap) {
  const data = {};
  snap.forEach((docSnap) => {
    data[docSnap.id] = docSnap.data();
  });
  return data;
}

export default function InventoryAdjustmentTab() {
  const [adjustments, setAdjustments] = useState({});
  const [pendingChanges, setPendingChanges] = useState({});

  // Config collection (doc id = testName). Rarely changes — one-shot getDocs
  // is enough. Local save merges into state so this tab's UX stays identical.
  useEffect(() => {
    let cancelled = false;
    getDocs(collection(db, "inventory_adjustments"))
      .then((snap) => {
        if (cancelled) return;
        setAdjustments(mapAdjustmentSnap(snap));
      })
      .catch((err) => {
        console.error(
          "[InventoryAdjustment] inventory_adjustments getDocs failed:",
          err
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAnalyzerChange = (
    testName,
    analyzer
  ) => {
  
    setPendingChanges(prev => ({
      ...prev,
      [testName]: analyzer
    }));
  };

  const saveChanges = async () => {

    try {
  
      const updates = Object.entries(
        pendingChanges
      );
      if (updates.length === 0) return;
        const confirmed = window.confirm(
          `Save ${updates.length} routing change(s)?`
        );
        if (!confirmed) return;
      
  
     
     
        const batch = writeBatch(db);

        for (const [testName, analyzer] of updates) {
        
          batch.set(
            doc(
              db,
              "inventory_adjustments",
              testName
            ),
            {
              testName,
              analyzer,
              updatedAt: serverTimestamp(),
              updatedBy:
                sessionStorage.getItem("loggedUser") ||
                "Unknown"
            },
            { merge: true }
          );
        }
        
        await batch.commit();

        for (const [testName, analyzer] of updates) {
          setStaticConfig(`inventory_adjustments:${testName}`, {
            testName,
            analyzer,
          });
        }

        // Mirror prior onSnapshot UX after local save (no live listener).
        setAdjustments((prev) => {
          const next = { ...prev };
          for (const [testName, analyzer] of updates) {
            next[testName] = {
              ...(next[testName] || {}),
              testName,
              analyzer,
            };
          }
          return next;
        });
        


  
      alert(
        `${updates.length} routing changes saved`
      );
  
      setPendingChanges({});
  
    } catch (err) {
  
      console.error(err);
  
      alert(
        "Failed to save changes."
      );
    }
  };


  const renderAnalyzerButtons = (
    test,
    optionA,
    optionB
  ) => {
  
    const analyzer =
      pendingChanges[test] ??
      adjustments[test]?.analyzer ??
      optionA;
  
    return (
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginTop: "10px",
        }}
      >
        {[optionA, optionB].map((option) => (
          <button
            key={option}
            onClick={() =>
              handleAnalyzerChange(
                test,
                option
              )
            }
            style={{
              padding: "8px 16px",
              borderRadius: "999px",
              border:
                analyzer === option
                  ? "2px solid #2563eb"
                  : "1px solid #d1d5db",
              background:
                analyzer === option
                  ? "#2563eb"
                  : "#fff",
              color:
                analyzer === option
                  ? "#fff"
                  : "#374151",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {option}
          </button>
        ))}
      </div>
    );
  };





  return (
    <div
      style={{
        padding: "20px",
      }}
    >
      <h2>
        Inventory Deduction Routing
      </h2>
  
      <p>
        Select which analyzer should consume
        inventory for each test.
      </p>
      <div
  style={{
    display: "grid",
    gap: "30px",
  }}
>

  {/* BIOCHEMISTRY */}

  <div
    style={{
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: "12px",
      padding: "20px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    }}
  >
    <h3
      style={{
        marginBottom: "4px",
      }}
    >
      Biochemistry Routing
    </h3>

    <p
      style={{
        color: "#6b7280",
        marginBottom: "20px",
      }}
    >
      Vitros ↔ Yumizen C-150
    </p>

    <div
  style={{
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(350px, 1fr))",
    gap: "12px",
  }}
>
  {biochemTests.map((test) => (
      <div
      key={test}
      style={{
        background: pendingChanges[test] ? "#eff6ff" : "#fafafa",
        border: pendingChanges[test]
        ? "2px solid #2563eb"
        : "1px solid #e5e7eb",
        borderRadius: "10px",
        padding: "16px",
        minHeight: "120px",
      }}
    >
       
       <>
  <div
    style={{
      fontWeight: 600,
      fontSize: "14px",
    }}
  >
    {test}
  </div>

  <div
    style={{
      fontSize: "12px",
      color: "#6b7280",
      marginTop: "4px",
    }}
  >
    Current: {" "} 
    {pendingChanges[test] ??
  adjustments[test]?.analyzer ??
  "VITROS"}
    </div>
  </>

        {renderAnalyzerButtons(
          test,
          "VITROS",
          "YUMIZEN C-150"
        )}
      </div>
    ))}
  </div>
  </div>
  

  {/* HORMONES */}

  <div
    style={{
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: "12px",
      padding: "20px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    }}
  >
    <h3
      style={{
        marginBottom: "4px",
      }}
    >
      Hormones Routing
    </h3>

    <p
      style={{
        color: "#6b7280",
        marginBottom: "20px",
      }}
    >
      Vitros ↔ Access 2
    </p>

    <div
  style={{
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(350px, 1fr))",
    gap: "12px",
  }}
>
  {hormoneTests.map((test) => (
     <div
     key={test}
     style={{
      background: pendingChanges[test]
      ? "#eff6ff"
      : "#fafafa",
      border: pendingChanges[test]
      ? "2px solid #2563eb"
      : "1px solid #e5e7eb",
       borderRadius: "10px",
       padding: "16px",
       minHeight: "120px",
     }}
   >
      <>
  <div
    style={{
      fontWeight: 600,
      fontSize: "14px",
    }}
  >
    {test}
  </div>

  <div
    style={{
      fontSize: "12px",
      color: "#6b7280",
      marginTop: "4px",
    }}
  >
    Current:
    {" "}
    {pendingChanges[test] ??
  adjustments[test]?.analyzer ??
  "VITROS"}
  </div>
</>

      {renderAnalyzerButtons(
        test,
        "VITROS",
        "ACCESS 2"
      )}
    </div>
  ))}
</div>
  </div>

  {/* FOOTER */}

<div
  style={{
    position: "sticky",
    bottom: 0,
    background: "#fff",
    borderTop: "1px solid #e5e7eb",
    padding: "16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: "12px",
    boxShadow: "0 -2px 8px rgba(0,0,0,0.05)",
  }}
>
  <div>
    {Object.keys(pendingChanges).length > 0 && (
      <div
        style={{
          color: "#b45309",
          fontWeight: 600,
          fontSize: "13px",
        }}
      >
        ⚠ Unsaved routing changes
      </div>
    )}

    <div
      style={{
        fontWeight: 600,
        marginTop: "4px",
      }}
    >
      {Object.keys(pendingChanges).length}
      {" "}Pending Changes
    </div>
  </div>

  <button
    onClick={saveChanges}
    disabled={
      Object.keys(pendingChanges).length === 0
    }
    style={{
      background:
        Object.keys(pendingChanges).length === 0
          ? "#9ca3af"
          : "#2563eb",
      color: "#fff",
      border: "none",
      padding: "10px 22px",
      borderRadius: "8px",
      cursor:
        Object.keys(pendingChanges).length === 0
          ? "not-allowed"
          : "pointer",
      fontWeight: 600,
    }}
  >
    Confirm Changes
  </button>
</div>
</div> 

</div> 

  );
}