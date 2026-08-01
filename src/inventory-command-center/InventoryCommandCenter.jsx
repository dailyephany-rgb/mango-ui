import React, { useEffect, useState } from "react";

import {
  collection,
  query,
  where,
  orderBy,
  Timestamp
} from "firebase/firestore";
import { trackedOnSnapshot as onSnapshot } from "../shared/firestore/trackedFirestore.js";

import { db } from "../firebaseConfig.js";
import {
  getISTDateString,
  istDayStart,
  istDayEndExclusive,
} from "../shared/utils/dates.js";
import { scopedTimestampRangeQuery } from "../shared/firestore/scopedTimestampRangeQuery.js";
import { INVENTORY_LIVE_STATUSES } from "../shared/firestore/subscribeInventoryByMachines.js";
import {
  getCache,
  setCache,
  SESSION_QUERY_TTL_MS,
} from "../shared/cache/sessionQueryCache.js";

import LiveInventoryTab from "./tabs/LiveInventoryTab";
import ExpirySurveillanceTab from "./tabs/ExpirySurveillanceTab";
import QCMonitorTab from "./tabs/QCMonitorTab";
import ConsumptionLedgerTab from "./tabs/ConsumptionLedgerTab";
import CostAnalyticsTab from "./tabs/CostAnalyticsTab";
import ConsumedInventoryTab from "./tabs/ConsumedInventoryTab";

const mapDocs = (snapshot) =>
  snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

const paintOrClear = (setter, cacheKey) => {
  const cached = getCache(cacheKey);
  if (Array.isArray(cached)) {
    setter(cached);
  } else {
    setter([]);
  }
};

const InventoryCommandCenter = () => {
  const today = getISTDateString();
  const [activeTab, setActiveTab] = useState("Inventory");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);

  const [inventoryLogs, setInventoryLogs] = useState([]);
  const [qcLogs, setQCLogs] = useState([]);
  const [calibrationLogs, setCalibrationLogs] = useState([]);
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [comboLedgerEntries, setComboLedgerEntries] = useState([]);

  const dateRange = { from: fromDate, to: toDate };

  useEffect(() => {
    const unsubs = [];

    // Live stock — Inventory + Expiry (+ Cost lookup). Never session-cache.
    if (
      activeTab === "Inventory" ||
      activeTab === "Expiry" ||
      activeTab === "Cost"
    ) {
      setInventoryLogs([]);
      const liveQ = query(
        collection(db, "inventory_logs"),
        where("status", "in", INVENTORY_LIVE_STATUSES)
      );
      unsubs.push(
        onSnapshot(
          liveQ,
          (snap) => setInventoryLogs(mapDocs(snap)),
          (err) => {
            console.error("[ICC] live inventory_logs failed:", err);
            setInventoryLogs([]);
          }
        )
      );
    }

    // Consumed history — status + consumedAt range
    if (activeTab === "Consumed") {
      const consumedKey = `icc:consumed:${fromDate}:${toDate}`;
      paintOrClear(setInventoryLogs, consumedKey);
      const start = istDayStart(fromDate);
      const endExclusive = istDayEndExclusive(toDate);
      if (start && endExclusive) {
        const consumedQ = query(
          collection(db, "inventory_logs"),
          where("status", "==", "Consumed"),
          where("consumedAt", ">=", Timestamp.fromDate(start)),
          where("consumedAt", "<", Timestamp.fromDate(endExclusive)),
          orderBy("consumedAt", "desc")
        );
        unsubs.push(
          onSnapshot(
            consumedQ,
            (snap) => {
              const next = mapDocs(snap);
              setInventoryLogs(next);
              setCache(consumedKey, next, SESSION_QUERY_TTL_MS);
            },
            (err) => {
              console.error(
                "[ICC] consumed inventory_logs failed — check index (status + consumedAt):",
                err
              );
              setInventoryLogs([]);
            }
          )
        );
      }
    }

    // QC & Calibration — timestamp range (history)
    if (activeTab === "QC") {
      const qcKey = `icc:qc:${fromDate}:${toDate}`;
      const calKey = `icc:calibration:${fromDate}:${toDate}`;
      paintOrClear(setQCLogs, qcKey);
      paintOrClear(setCalibrationLogs, calKey);

      const qcQ = scopedTimestampRangeQuery("qc_logs", "timestamp", dateRange);
      const calQ = scopedTimestampRangeQuery(
        "calibration_logs",
        "timestamp",
        dateRange
      );
      if (qcQ) {
        unsubs.push(
          onSnapshot(
            qcQ,
            (snap) => {
              const next = mapDocs(snap);
              setQCLogs(next);
              setCache(qcKey, next, SESSION_QUERY_TTL_MS);
            },
            (err) => {
              console.error("[ICC] qc_logs timestamp query failed:", err);
              setQCLogs([]);
            }
          )
        );
      }
      if (calQ) {
        unsubs.push(
          onSnapshot(
            calQ,
            (snap) => {
              const next = mapDocs(snap);
              setCalibrationLogs(next);
              setCache(calKey, next, SESSION_QUERY_TTL_MS);
            },
            (err) => {
              console.error(
                "[ICC] calibration_logs timestamp query failed:",
                err
              );
              setCalibrationLogs([]);
            }
          )
        );
      }
    }

    // Consumption ledgers — timestamp range (history)
    if (activeTab === "Ledger" || activeTab === "Cost") {
      const ledgerKey = `icc:ledger:${fromDate}:${toDate}`;
      paintOrClear(setLedgerEntries, ledgerKey);
      const ledgerQ = scopedTimestampRangeQuery(
        "consumption_ledger",
        "timestamp",
        dateRange
      );
      if (ledgerQ) {
        unsubs.push(
          onSnapshot(
            ledgerQ,
            (snap) => {
              const next = mapDocs(snap);
              setLedgerEntries(next);
              setCache(ledgerKey, next, SESSION_QUERY_TTL_MS);
            },
            (err) => {
              console.error(
                "[ICC] consumption_ledger timestamp query failed:",
                err
              );
              setLedgerEntries([]);
            }
          )
        );
      }
    }

    if (activeTab === "Ledger") {
      const comboKey = `icc:comboLedger:${fromDate}:${toDate}`;
      paintOrClear(setComboLedgerEntries, comboKey);
      const comboQ = scopedTimestampRangeQuery(
        "combo_consumption_ledger",
        "timestamp",
        dateRange
      );
      if (comboQ) {
        unsubs.push(
          onSnapshot(
            comboQ,
            (snap) => {
              const next = mapDocs(snap);
              setComboLedgerEntries(next);
              setCache(comboKey, next, SESSION_QUERY_TTL_MS);
            },
            (err) => {
              console.error(
                "[ICC] combo_consumption_ledger timestamp query failed:",
                err
              );
              setComboLedgerEntries([]);
            }
          )
        );
      }
    }

    return () => unsubs.forEach((u) => u());
  }, [activeTab, fromDate, toDate]);

  const dateProps = { fromDate, toDate, setFromDate, setToDate };

  return (
    <div className="inventory-command-center">
      <div className="command-center-header">
        <h1>Inventory Command Center</h1>

        <div className="command-tabs">
          <button
            className={activeTab === "Inventory" ? "active-tab" : ""}
            onClick={() => setActiveTab("Inventory")}
          >
            Inventory
          </button>

          <button
            className={activeTab === "Expiry" ? "active-tab" : ""}
            onClick={() => setActiveTab("Expiry")}
          >
            Expiry
          </button>

          <button
            className={activeTab === "QC" ? "active-tab" : ""}
            onClick={() => setActiveTab("QC")}
          >
            QC & Calibration
          </button>

          <button
            className={activeTab === "Ledger" ? "active-tab" : ""}
            onClick={() => setActiveTab("Ledger")}
          >
            Consumption Ledger
          </button>

          <button
            className={activeTab === "Cost" ? "active-tab" : ""}
            onClick={() => setActiveTab("Cost")}
          >
            Cost Analytics
          </button>

          <button
            className={activeTab === "Consumed" ? "active-tab" : ""}
            onClick={() => setActiveTab("Consumed")}
          >
            Consumed Inventory
          </button>
        </div>
      </div>

      {activeTab === "Inventory" && (
        <LiveInventoryTab inventoryLogs={inventoryLogs} />
      )}

      {activeTab === "Expiry" && (
        <ExpirySurveillanceTab inventoryLogs={inventoryLogs} />
      )}

      {activeTab === "QC" && (
        <QCMonitorTab
          qcLogs={qcLogs}
          calibrationLogs={calibrationLogs}
          {...dateProps}
        />
      )}

      {activeTab === "Ledger" && (
        <ConsumptionLedgerTab
          ledgerEntries={ledgerEntries}
          comboLedgerEntries={comboLedgerEntries}
          {...dateProps}
        />
      )}

      {activeTab === "Cost" && (
        <CostAnalyticsTab
          ledgerEntries={ledgerEntries}
          inventory={inventoryLogs}
          {...dateProps}
        />
      )}

      {activeTab === "Consumed" && (
        <ConsumedInventoryTab
          inventoryLogs={inventoryLogs}
          {...dateProps}
        />
      )}
    </div>
  );
};

export default InventoryCommandCenter;
