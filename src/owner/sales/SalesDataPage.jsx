/**
 * Sales Data Phase 1 — Owner App page.
 * Upload → classify → six tabs → search → MOVE TO.
 * Client-side only; no clinical / Firestore write paths.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
} from "react";
import UserMenu from "../../auth/UserMenu.jsx";
import {
  CLASSIFICATION,
  SALES_TABS,
  tabLabel,
} from "./classification.js";
import {
  parseSalesExcelBuffer,
  processSalesRows,
} from "./parseSalesExcel.js";
import "./SalesData.css";

const VIRTUAL_ROW = 108;
const OVERSCAN = 8;

function getLoggedUser() {
  try {
    return sessionStorage.getItem("loggedUser") || "Owner";
  } catch {
    return "Owner";
  }
}

function matchesSearch(entry, q) {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    String(entry.regNo || "")
      .toLowerCase()
      .includes(needle) ||
    String(entry.diagnosticNo || "")
      .toLowerCase()
      .includes(needle)
  );
}

function fmtMoney(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function SalesEntryCard({ entry, onMove }) {
  const auto =
    entry.classificationSource === "automatic"
      ? "AUTO"
      : "MANUAL";
  const badge = `${auto} · ${tabLabel(entry.currentClassification)}`;
  const origNote =
    entry.classificationSource === "manual" &&
    entry.originalClassification !== entry.currentClassification
      ? `Was ${tabLabel(entry.originalClassification)}`
      : null;

  return (
    <div className={`sales-entry sales-tone-${entry.currentClassification}`}>
      <div className="sales-entry-top">
        <span className="sales-badge">{badge}</span>
        <label className="sales-move">
          <span className="sales-move-label">MOVE TO</span>
          <select
            aria-label="Move entry to classification"
            defaultValue=""
            onChange={(e) => {
              const dest = e.target.value;
              e.target.value = "";
              if (dest) onMove(entry.id, dest);
            }}
          >
            <option value="" disabled>
              ▼
            </option>
            {SALES_TABS.map((t) => (
              <option key={t.id} value={t.id} disabled={t.id === entry.currentClassification}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="sales-entry-grid">
        <div>
          <span className="sales-k">Reg No</span>
          <span className="sales-v">{entry.regNo || "—"}</span>
        </div>
        <div>
          <span className="sales-k">Accession / Diag</span>
          <span className="sales-v">{entry.diagnosticNo || "—"}</span>
        </div>
        <div className="sales-span2">
          <span className="sales-k">Patient</span>
          <span className="sales-v">{entry.name || "—"}</span>
        </div>
        <div className="sales-span2">
          <span className="sales-k">Investigation</span>
          <span className="sales-v">{entry.investigation || "—"}</span>
        </div>
        <div>
          <span className="sales-k">Category</span>
          <span className="sales-v">{entry.category || "—"}</span>
        </div>
        <div>
          <span className="sales-k">Amount</span>
          <span className="sales-v">{fmtMoney(entry.amount)}</span>
        </div>
        <div>
          <span className="sales-k">Discount</span>
          <span className="sales-v">{fmtMoney(entry.discount)}</span>
        </div>
        <div>
          <span className="sales-k">Net</span>
          <span className="sales-v">{fmtMoney(entry.netamt)}</span>
        </div>
      </div>
      {origNote ? <div className="sales-orig">{origNote}</div> : null}
    </div>
  );
}

function VirtualEntryList({ items, onMove }) {
  const parentRef = useRef(null);
  const [range, setRange] = useState({ start: 0, end: 30 });

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      const start = Math.max(0, Math.floor(el.scrollTop / VIRTUAL_ROW) - OVERSCAN);
      const visible = Math.ceil(el.clientHeight / VIRTUAL_ROW) + OVERSCAN * 2;
      setRange({ start, end: Math.min(items.length, start + visible) });
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [items.length]);

  if (!items.length) {
    return <p className="sales-empty">No entries in this tab.</p>;
  }

  const slice = items.slice(range.start, range.end);
  const padTop = range.start * VIRTUAL_ROW;
  const padBottom = Math.max(0, (items.length - range.end) * VIRTUAL_ROW);

  return (
    <div className="sales-list table-wrapper" ref={parentRef}>
      <div style={{ height: padTop }} />
      {slice.map((entry) => (
        <SalesEntryCard key={entry.id} entry={entry} onMove={onMove} />
      ))}
      <div style={{ height: padBottom }} />
    </div>
  );
}

export default function SalesDataPage() {
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [entries, setEntries] = useState([]);
  const [activeTab, setActiveTab] = useState(CLASSIFICATION.COMPLEMENTARY);
  const [search, setSearch] = useState("");
  const [showUnclassified, setShowUnclassified] = useState(false);
  const fileRef = useRef(null);
  const pendingFile = useRef(null);

  const counts = useMemo(() => {
    const c = Object.fromEntries(SALES_TABS.map((t) => [t.id, 0]));
    c[CLASSIFICATION.UNCLASSIFIED] = 0;
    for (const e of entries) {
      const key = e.currentClassification;
      if (c[key] == null) c[key] = 0;
      c[key] += 1;
    }
    return c;
  }, [entries]);

  const unclassifiedCount = counts[CLASSIFICATION.UNCLASSIFIED] || 0;

  const visibleEntries = useMemo(() => {
    const bin = showUnclassified
      ? CLASSIFICATION.UNCLASSIFIED
      : activeTab;
    const list = [];
    for (const e of entries) {
      if (e.currentClassification !== bin) continue;
      if (!matchesSearch(e, search)) continue;
      list.push(e);
    }
    return list;
  }, [entries, activeTab, search, showUnclassified]);

  const onFileChosen = (e) => {
    const f = e.target.files?.[0];
    pendingFile.current = f || null;
    setFileName(f ? f.name : "");
    setError("");
  };

  const processFile = async () => {
    const f = pendingFile.current;
    if (!f) {
      setError("Choose an Excel file first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const buffer = await f.arrayBuffer();
      const { rows } = parseSalesExcelBuffer(buffer);
      const { entries: processed } = processSalesRows(rows);
      startTransition(() => {
        setEntries(processed);
        setShowUnclassified(false);
        setActiveTab(CLASSIFICATION.GENERAL_LOOP);
        setSearch("");
      });
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to process file.");
      setEntries([]);
    } finally {
      setBusy(false);
    }
  };

  const moveEntry = useCallback((id, dest) => {
    const user = getLoggedUser();
    const when = new Date().toISOString();
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        if (e.currentClassification === dest) return e;
        return {
          ...e,
          currentClassification: dest,
          classificationSource: "manual",
          movedAt: when,
          movedBy: user,
        };
      })
    );
  }, []);

  return (
    <div className="owner-root sales-root">
      <header className="owner-header">
        <h1>Sales Data</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <UserMenu />
        </div>
      </header>

      <section className="chart-card sales-upload">
        <h3>Upload Raw Report</h3>
        <p className="sales-help">
          Phase 1: classify and review only. No financial calculations.
        </p>
        <div className="sales-upload-row">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={onFileChosen}
          />
          <button
            type="button"
            className="sales-btn"
            onClick={processFile}
            disabled={busy}
          >
            {busy ? "Processing…" : "Process File"}
          </button>
        </div>
        {fileName ? (
          <p className="sales-meta">
            File: <strong>{fileName}</strong>
            {entries.length ? (
              <>
                {" "}
                · Entries: <strong>{entries.length.toLocaleString()}</strong>
              </>
            ) : null}
          </p>
        ) : null}
        {error ? <p className="sales-error">{error}</p> : null}
        {unclassifiedCount > 0 ? (
          <p className="sales-warn">
            {unclassifiedCount.toLocaleString()} entries unclassified{" "}
            <button
              type="button"
              className="sales-linkish"
              onClick={() => {
                setShowUnclassified(true);
                setSearch("");
              }}
            >
              Review
            </button>
          </p>
        ) : null}
      </section>

      <div className="tab-buttons sales-tabs">
        {SALES_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={
              !showUnclassified && activeTab === t.id
                ? `active sales-tab-${t.tone}`
                : `sales-tab-${t.tone}`
            }
            onClick={() => {
              setShowUnclassified(false);
              setActiveTab(t.id);
            }}
          >
            {t.label} ({(counts[t.id] || 0).toLocaleString()})
          </button>
        ))}
      </div>

      {showUnclassified ? (
        <div className="sales-unclassified-bar">
          Viewing unclassified ({unclassifiedCount.toLocaleString()}) — use MOVE
          TO to place into a bin.{" "}
          <button
            type="button"
            className="sales-linkish"
            onClick={() => setShowUnclassified(false)}
          >
            Back to tabs
          </button>
        </div>
      ) : null}

      <div className="owner-filter-bar sales-search-bar">
        <label>
          Search Reg No or Diagnostic No
          <input
            type="search"
            placeholder="Search Reg No or Diagnostic No"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={!entries.length}
          />
        </label>
        <div className="sales-visible-count">
          Showing {visibleEntries.length.toLocaleString()}
        </div>
      </div>

      <VirtualEntryList items={visibleEntries} onMove={moveEntry} />
    </div>
  );
}
