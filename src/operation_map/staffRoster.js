import { users } from "../auth/users.js";

export function seedStaffFromUsers(extra = []) {
  const seen = new Set();
  const list = [];

  users.forEach((u) => {
    const name = String(u.username || "").trim();
    if (!name) return;
    const id = name;
    if (seen.has(id.toLowerCase())) return;
    seen.add(id.toLowerCase());
    list.push({
      id,
      name,
      qualification: "",
      onDutyDefault: true,
    });
  });

  (extra || []).forEach((s) => {
    const id = String(s.id || s.name || "").trim();
    if (!id || seen.has(id.toLowerCase())) return;
    seen.add(id.toLowerCase());
    list.push({
      id,
      name: s.name || id,
      qualification: s.qualification || "",
      onDutyDefault: s.onDutyDefault !== false,
    });
  });

  return list.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Whether a leave entry applies on a given hour.
 * Entries may be legacy dayPlan.leave or approved multi-day request rows
 * already filtered to the map date.
 */
export function isOnLeaveForHour(leaveList, staffId, hourKey) {
  if (!staffId) return false;
  const entries = (leaveList || []).filter((l) => l.staffId === staffId);
  if (!entries.length) return false;

  return entries.some((l) => leaveEntryCoversHour(l, hourKey));
}

export function leaveEntryCoversHour(entry, hourKey) {
  if (!entry) return false;
  if (entry.type === "full" || !entry.startTime) return true;
  const h = hourKey || "00:00";
  const start = entry.startTime;
  const end = entry.endTime || "23:59";
  if (end > start) return h >= start && h < end;
  return h >= start || h < end;
}

/**
 * Merge legacy day leave + approved request leave for one map date.
 */
export function mergeLeaveForDate(dayLeave, approvedEntries) {
  const out = [];
  const seen = new Set();
  [...(dayLeave || []), ...(approvedEntries || [])].forEach((l) => {
    if (!l?.staffId) return;
    const key = `${l.staffId}|${l.type}|${l.startTime || ""}|${l.endTime || ""}|${l.requestId || "day"}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(l);
  });
  return out;
}

export function getLeaveLabel(leaveList, staffId, hourKey) {
  const entries = (leaveList || []).filter((l) => l.staffId === staffId);
  if (!entries.length) return null;
  const hit = entries.find((l) => {
    if (l.type === "full" || !l.startTime) return true;
    return isOnLeaveForHour([l], staffId, hourKey);
  });
  if (!hit) return null;
  if (hit.type === "full" || !hit.startTime) return "Full Day";
  return `${hit.startTime} - ${hit.endTime || ""}`;
}
