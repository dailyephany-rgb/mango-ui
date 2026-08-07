/**
 * Presentation helpers for Engineering Dashboard performance views.
 * Pure functions — no telemetry / no clinical imports.
 */

export function fmtMs(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}

export function fmtTs(ts) {
  if (ts == null) return "—";
  try {
    const n = typeof ts?.toMillis === "function" ? ts.toMillis() : Number(ts);
    if (!Number.isFinite(n)) return "—";
    return new Date(n).toLocaleString();
  } catch {
    return "—";
  }
}

export function dayKeyFromTs(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Map stored page-load sample → waterfall stages (only fields we already capture).
 * Missing stages show null (UI renders —).
 */
export function buildWaterfall(load) {
  const paint = load.firstPaintMs ?? null;
  const mount = load.firstRenderMs ?? null;
  const snap = load.firstSnapshotMs ?? null;
  const interactive = load.interactiveMs ?? null;
  const total = load.totalMs ?? null;

  const stages = [
    { id: "nav", label: "Navigation Start", atMs: 0, durationMs: 0 },
    {
      id: "boot",
      label: "React Boot (first paint)",
      atMs: paint,
      durationMs: paint,
    },
    {
      id: "mount",
      label: "React Mount",
      atMs: mount,
      durationMs:
        mount != null && paint != null
          ? Math.max(0, mount - paint)
          : mount,
    },
    {
      id: "query",
      label: "Firestore Query / First Snapshot",
      atMs: snap,
      durationMs:
        snap != null && mount != null
          ? Math.max(0, snap - mount)
          : snap,
      note:
        snap == null
          ? "Never arrived — listeners still waiting or WebChannel hung (iPad Wi‑Fi pattern)"
          : undefined,
    },
    {
      id: "table",
      label: "Table Render",
      atMs: null,
      durationMs: null,
      note: "Not instrumented — use Interactive as usable UI proxy",
    },
    {
      id: "interactive",
      label: "Interactive",
      atMs: snap == null ? null : interactive,
      durationMs:
        snap == null
          ? null
          : interactive != null && snap != null
            ? Math.max(0, interactive - snap)
            : interactive != null && mount != null
              ? Math.max(0, interactive - mount)
              : interactive,
      note:
        snap == null
          ? "Not reached — blocked on first Firestore snapshot"
          : undefined,
    },
    {
      id: "ready",
      label: "Ready / Total",
      atMs: total,
      durationMs:
        snap == null
          ? total
          : total != null && interactive != null
            ? Math.max(0, total - interactive)
            : total,
      note:
        snap == null
          ? "Timer finalized without snapshot (hung load)"
          : undefined,
    },
  ];

  const measured = stages
    .filter((s) => typeof s.durationMs === "number" && s.id !== "nav")
    .map((s) => s.durationMs);
  const slowest =
    measured.length > 0 ? Math.max(...measured) : null;

  return { stages, slowest, total };
}

export function loadStatus(load, slowMs = 2000) {
  // No first snapshot = Firestore never answered (iPad hang pattern)
  if (load.hung || (load.totalMs != null && load.firstSnapshotMs == null)) {
    return "hung";
  }
  const t = load.totalMs;
  if (t == null) return "unknown";
  if (t >= slowMs * 2) return "critical";
  if (t >= slowMs) return "slow";
  return "ok";
}

export function percentile(values, p) {
  const arr = values.filter((n) => typeof n === "number").sort((a, b) => a - b);
  if (!arr.length) return null;
  const idx = Math.min(arr.length - 1, Math.ceil(p * (arr.length - 1)));
  return arr[idx];
}

export function filterPageLoads(loads, f = {}) {
  return (loads || []).filter((r) => {
    if (f.device && !(String(r.deviceId || "").includes(f.device) || String(r.label || "").toLowerCase().includes(String(f.device).toLowerCase()))) {
      return false;
    }
    if (f.department && r.department !== f.department) return false;
    if (f.page && r.page !== f.page) return false;
    if (f.build && String(r.buildId || "") !== String(f.build)) return false;
    if (f.day && r.day !== f.day && dayKeyFromTs(r.ts) !== f.day) return false;
    if (f.q) {
      const q = String(f.q).toLowerCase();
      const blob = `${r.deviceId || ""} ${r.department || ""} ${r.page || ""} ${r.buildId || ""} ${fmtTs(r.ts)}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    if (f.rangeDays != null && r.ts) {
      const min = Date.now() - f.rangeDays * 86400000;
      if (r.ts < min) return false;
    }
    return true;
  });
}

export function sortPageLoads(loads, key = "ts", dir = "desc") {
  const mul = dir === "asc" ? 1 : -1;
  return [...(loads || [])].sort((a, b) => {
    const av = a[key] ?? -Infinity;
    const bv = b[key] ?? -Infinity;
    if (av === bv) return 0;
    return av > bv ? mul : -mul;
  });
}

/**
 * Download CSV from array of objects.
 * @param {string} filename
 * @param {object[]} rows
 * @param {string[]} [columns]
 */
export function downloadCsv(filename, rows, columns) {
  const cols =
    columns ||
    (rows[0] ? Object.keys(rows[0]) : []);
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    cols.join(","),
    ...rows.map((r) => cols.map((c) => esc(r[c])).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function rangeDaysFromPreset(preset) {
  if (preset === "today") return 1;
  if (preset === "yesterday") return 2;
  if (preset === "7d") return 7;
  if (preset === "30d") return 30;
  return 7;
}

/** Calendar-day filter for today / yesterday presets */
export function inDatePreset(ts, preset) {
  if (ts == null) return false;
  const day = dayKeyFromTs(ts);
  const today = dayKeyFromTs();
  if (preset === "today") return day === today;
  if (preset === "yesterday") {
    const y = dayKeyFromTs(Date.now() - 86400000);
    return day === y || day === today;
  }
  const days = rangeDaysFromPreset(preset);
  return ts >= Date.now() - days * 86400000;
}

export function avg(nums) {
  const a = (nums || []).filter((n) => typeof n === "number");
  if (!a.length) return null;
  return a.reduce((s, n) => s + n, 0) / a.length;
}

export function summarizeLoads(loads) {
  const totals = (loads || []).map((r) => r.totalMs).filter((n) => typeof n === "number");
  return {
    count: loads?.length || 0,
    avg: avg(totals),
    fastest: totals.length ? Math.min(...totals) : null,
    slowest: totals.length ? Math.max(...totals) : null,
    p95: percentile(totals, 0.95),
  };
}

/** Bucket samples by day for sparkline trends */
export function trendByDay(loads, field = "totalMs", days = 7) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKeyFromTs(Date.now() - i * 86400000);
    const dayLoads = (loads || []).filter(
      (r) => (r.day || dayKeyFromTs(r.ts)) === key
    );
    const vals = dayLoads
      .map((r) => r[field])
      .filter((n) => typeof n === "number");
    out.push({
      day: key,
      avg: avg(vals),
      p95: percentile(vals, 0.95),
      count: dayLoads.length,
    });
  }
  return out;
}
