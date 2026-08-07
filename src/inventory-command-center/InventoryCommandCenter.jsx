import React, { useEffect, useRef, useState } from "react";

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
import { annotateListenReason } from "../engineering/telemetry/listenerWatch.js";

import LiveInventoryTab from "./tabs/LiveInventoryTab";
import ExpirySurveillanceTab from "./tabs/ExpirySurveillanceTab";
import QCMonitorTab from "./tabs/QCMonitorTab";
import ConsumptionLedgerTab from "./tabs/ConsumptionLedgerTab";
import CostAnalyticsTab from "./tabs/CostAnalyticsTab";
import ConsumedInventoryTab from "./tabs/ConsumedInventoryTab";
import { EngComponent } from "../engineering/ui/EngComponent.jsx";

const mapDocs = (snapshot) =>
  snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

const paintOrClear = (setter, cacheKey) => {
  const cached = getCache(cacheKey);
  if (Array.isArray(cached)) {
    setter(cached);
    return true;
  }
  setter([]);
  return false;
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

  const [loadingLive, setLoadingLive] = useState(false);
  const [loadingConsumed, setLoadingConsumed] = useState(false);
  const [loadingQC, setLoadingQC] = useState(false);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [loadingCombo, setLoadingCombo] = useState(false);

  const liveGen = useRef(0);
  const dateGen = useRef(0);

  const dateRange = { from: fromDate, to: toDate };

  // Sibling-tab flags: same Firestore query stays subscribed across these tabs
  // so Inventory↔Expiry↔Cost (live) and Ledger↔Cost (ledger) do not re-seed.
  const needsLive =
    activeTab === "Inventory" ||
    activeTab === "Expiry" ||
    activeTab === "Cost";
  const needsConsumed = activeTab === "Consumed";
  const needsQC = activeTab === "QC";
  const needsLedger = activeTab === "Ledger" || activeTab === "Cost";
  const needsCombo = activeTab === "Ledger";

  const tabLoading =
    (needsLive && loadingLive) ||
    (needsConsumed && loadingConsumed) ||
    (needsQC && loadingQC) ||
    (needsLedger && loadingLedger) ||
    (needsCombo && loadingCombo);

  // Live stock — Inventory + Expiry + Cost packet lookup. Never session-cache.
  // Query shape unchanged — loading UX + listen-reason annotation only.
  useEffect(() => {
    if (!needsLive) {
      setLoadingLive(false);
      return undefined;
    }

    liveGen.current += 1;
    const reason = liveGen.current === 1 ? "page_load" : "deps_change";
    setLoadingLive(true);
    setInventoryLogs([]);

    const liveQ = query(
      collection(db, "inventory_logs"),
      where("status", "in", INVENTORY_LIVE_STATUSES)
    );
    annotateListenReason(liveQ, reason);
    const unsub = onSnapshot(
      liveQ,
      (snap) => {
        setInventoryLogs(mapDocs(snap));
        setLoadingLive(false);
      },
      (err) => {
        console.error("[ICC] live inventory_logs failed:", err);
        setInventoryLogs([]);
        setLoadingLive(false);
      }
    );
    return () => unsub();
  }, [needsLive]);

  // Consumed history — status + consumedAt range
  useEffect(() => {
    if (!needsConsumed) {
      setLoadingConsumed(false);
      return undefined;
    }

    dateGen.current += 1;
    const reason = dateGen.current === 1 ? "page_load" : "date_change";
    const consumedKey = `icc:consumed:${fromDate}:${toDate}`;
    const hadCache = paintOrClear(setInventoryLogs, consumedKey);
    setLoadingConsumed(!hadCache);
    const start = istDayStart(fromDate);
    const endExclusive = istDayEndExclusive(toDate);
    if (!start || !endExclusive) {
      setLoadingConsumed(false);
      return undefined;
    }

    const consumedQ = query(
      collection(db, "inventory_logs"),
      where("status", "==", "Consumed"),
      where("consumedAt", ">=", Timestamp.fromDate(start)),
      where("consumedAt", "<", Timestamp.fromDate(endExclusive)),
      orderBy("consumedAt", "desc")
    );
    annotateListenReason(consumedQ, reason);
    const unsub = onSnapshot(
      consumedQ,
      (snap) => {
        const next = mapDocs(snap);
        setInventoryLogs(next);
        setCache(consumedKey, next, SESSION_QUERY_TTL_MS);
        setLoadingConsumed(false);
      },
      (err) => {
        console.error(
          "[ICC] consumed inventory_logs failed — check index (status + consumedAt):",
          err
        );
        setInventoryLogs([]);
        setLoadingConsumed(false);
      }
    );
    return () => unsub();
  }, [needsConsumed, fromDate, toDate]);

  // QC & Calibration — timestamp range (history)
  useEffect(() => {
    if (!needsQC) {
      setLoadingQC(false);
      return undefined;
    }

    const reason = "date_change";
    const qcKey = `icc:qc:${fromDate}:${toDate}`;
    const calKey = `icc:calibration:${fromDate}:${toDate}`;
    const hadQc = paintOrClear(setQCLogs, qcKey);
    const hadCal = paintOrClear(setCalibrationLogs, calKey);
    setLoadingQC(!(hadQc && hadCal));

    const unsubs = [];
    const qcQ = scopedTimestampRangeQuery("qc_logs", "timestamp", dateRange);
    const calQ = scopedTimestampRangeQuery(
      "calibration_logs",
      "timestamp",
      dateRange
    );
    if (qcQ) {
      annotateListenReason(qcQ, reason);
      unsubs.push(
        onSnapshot(
          qcQ,
          (snap) => {
            const next = mapDocs(snap);
            setQCLogs(next);
            setCache(qcKey, next, SESSION_QUERY_TTL_MS);
            setLoadingQC(false);
          },
          (err) => {
            console.error("[ICC] qc_logs timestamp query failed:", err);
            setQCLogs([]);
            setLoadingQC(false);
          }
        )
      );
    }
    if (calQ) {
      annotateListenReason(calQ, reason);
      unsubs.push(
        onSnapshot(
          calQ,
          (snap) => {
            const next = mapDocs(snap);
            setCalibrationLogs(next);
            setCache(calKey, next, SESSION_QUERY_TTL_MS);
            setLoadingQC(false);
          },
          (err) => {
            console.error(
              "[ICC] calibration_logs timestamp query failed:",
              err
            );
            setCalibrationLogs([]);
            setLoadingQC(false);
          }
        )
      );
    }
    if (!qcQ && !calQ) setLoadingQC(false);
    return () => unsubs.forEach((u) => u());
  }, [needsQC, fromDate, toDate]);

  // Consumption ledger — Ledger + Cost. Persists across Ledger↔Cost.
  useEffect(() => {
    if (!needsLedger) {
      setLoadingLedger(false);
      return undefined;
    }

    const reason = "date_change";
    const ledgerKey = `icc:ledger:${fromDate}:${toDate}`;
    const hadCache = paintOrClear(setLedgerEntries, ledgerKey);
    setLoadingLedger(!hadCache);
    const ledgerQ = scopedTimestampRangeQuery(
      "consumption_ledger",
      "timestamp",
      dateRange
    );
    if (!ledgerQ) {
      setLoadingLedger(false);
      return undefined;
    }
    annotateListenReason(ledgerQ, reason);

    const unsub = onSnapshot(
      ledgerQ,
      (snap) => {
        const next = mapDocs(snap);
        setLedgerEntries(next);
        setCache(ledgerKey, next, SESSION_QUERY_TTL_MS);
        setLoadingLedger(false);
      },
      (err) => {
        console.error(
          "[ICC] consumption_ledger timestamp query failed:",
          err
        );
        setLedgerEntries([]);
        setLoadingLedger(false);
      }
    );
    return () => unsub();
  }, [needsLedger, fromDate, toDate]);

  // Combo ledger — Ledger tab only
  useEffect(() => {
    if (!needsCombo) {
      setLoadingCombo(false);
      return undefined;
    }

    const reason = "date_change";
    const comboKey = `icc:comboLedger:${fromDate}:${toDate}`;
    const hadCache = paintOrClear(setComboLedgerEntries, comboKey);
    setLoadingCombo(!hadCache);
    const comboQ = scopedTimestampRangeQuery(
      "combo_consumption_ledger",
      "timestamp",
      dateRange
    );
    if (!comboQ) {
      setLoadingCombo(false);
      return undefined;
    }
    annotateListenReason(comboQ, reason);

    const unsub = onSnapshot(
      comboQ,
      (snap) => {
        const next = mapDocs(snap);
        setComboLedgerEntries(next);
        setCache(comboKey, next, SESSION_QUERY_TTL_MS);
        setLoadingCombo(false);
      },
      (err) => {
        console.error(
          "[ICC] combo_consumption_ledger timestamp query failed:",
          err
        );
        setComboLedgerEntries([]);
        setLoadingCombo(false);
      }
    );
    return () => unsub();
  }, [needsCombo, fromDate, toDate]);

  const dateProps = { fromDate, toDate, setFromDate, setToDate };

  return (
    <EngComponent name="ICC Shell" type="Page" parent={null} moduleId="InventoryCommandCenter">
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

      {tabLoading && (
        <div
          role="status"
          aria-live="polite"
          style={{
            margin: "8px 16px",
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            background: "#f8fafc",
            color: "#334155",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Loading inventory data…
        </div>
      )}

      {activeTab === "Inventory" && (
        <EngComponent name="Live Inventory" type="Tables" parent="ICC Shell">
        <LiveInventoryTab inventoryLogs={inventoryLogs} />
        </EngComponent>
      )}

      {activeTab === "Expiry" && (
        <EngComponent name="Expiry" type="Tables" parent="ICC Shell">
        <ExpirySurveillanceTab inventoryLogs={inventoryLogs} />
        </EngComponent>
      )}

      {activeTab === "QC" && (
        <EngComponent name="QC Monitor" type="QC" parent="ICC Shell">
        <QCMonitorTab
          qcLogs={qcLogs}
          calibrationLogs={calibrationLogs}
          {...dateProps}
        />
        </EngComponent>
      )}

      {activeTab === "Ledger" && (
        <EngComponent name="Ledger" type="Tables" parent="ICC Shell">
        <ConsumptionLedgerTab
          ledgerEntries={ledgerEntries}
          comboLedgerEntries={comboLedgerEntries}
          {...dateProps}
        />
        </EngComponent>
      )}

      {activeTab === "Cost" && (
        <EngComponent name="Cost Analytics" type="Charts" parent="ICC Shell">
        <CostAnalyticsTab
          ledgerEntries={ledgerEntries}
          inventory={inventoryLogs}
          {...dateProps}
        />
        </EngComponent>
      )}

      {activeTab === "Consumed" && (
        <EngComponent name="Consumed" type="Tables" parent="ICC Shell" moduleId="ICC_Consumed">
        <ConsumedInventoryTab
          inventoryLogs={inventoryLogs}
          {...dateProps}
        />
        </EngComponent>
      )}
    </div>
    </EngComponent>
  );
};

export default InventoryCommandCenter;
