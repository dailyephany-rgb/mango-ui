# Mango LIMS — Architecture Documentation

**Product:** Mango (internal Laboratory Information Management System)  
**Stack:** React 19 · Vite 7 (Multi-Page Application) · Firebase Firestore  
**Project root:** `mango-ui`  
**Source of truth for clinical data:** Firestore only  
**Document status:** Forensic architecture audit (read-only analysis of `src/`)  
**File count audited:** 213 files under `src/` (`.js` / `.jsx` / `.css` / `.json`)  
**Generated:** 2026-08-07  

This documentation set exists so another engineering team can operate and maintain Mango for years. It describes **what the code does today**, not what should change.

---

## Table of Contents

| Part | File | Contents |
|------|------|----------|
| **0** | This file | Overview index, reading order, conventions |
| **1** | [Architecture_Part_1_Overview_and_Structure.md](./Architecture_Part_1_Overview_and_Structure.md) | Project overview, architecture style, full folder tree, Vite MPA entry map |
| **2** | [Architecture_Part_2_File_Inventory.md](./Architecture_Part_2_File_Inventory.md) | Per-file inventory tables: exports, importers, signals, criticality |
| **2B** | [Architecture_Part_2B_File_Purposes.md](./Architecture_Part_2B_File_Purposes.md) | Per-file purpose narrative, imports, importers for every `src` file |
| **3** | [Architecture_Part_3_Components_and_Departments.md](./Architecture_Part_3_Components_and_Departments.md) | Component dependency maps, every department module |
| **4** | [Architecture_Part_4_Flows_Firebase_Listeners.md](./Architecture_Part_4_Flows_Firebase_Listeners.md) | Page flows, Firebase collections, listener audit |
| **5** | [Architecture_Part_5_State_Effects_Performance_CSS.md](./Architecture_Part_5_State_Effects_Performance_CSS.md) | Filters, state, useEffect audit, performance map, CSS, engineering notes |
| **A** | [Architecture_Appendix_A_Deep_Module_Notes.md](./Architecture_Appendix_A_Deep_Module_Notes.md) | Dense module wiring: save patterns, localStorage keys, Owner/ICC accuracy notes |
| **EDS** | [Engineering_Telemetry_Platform_EDS.md](./Engineering_Telemetry_Platform_EDS.md) | Engineering Telemetry Platform design (observe-only; no clinical dependency) |

### Machine-readable companions

| File | Purpose |
|------|---------|
| [`_inventory.json`](./_inventory.json) | Static parse of all src files (exports, imports, onSnapshot/useEffect counts) |
| [`_meta.json`](./_meta.json) | HTML entries, `main_*.jsx` bootstraps, collection→file map |
| [`_entries.md`](./_entries.md) | Raw HTML script tags |

---

## Conventions Used in This Document

- **MPA page** — Separate HTML file + Vite entry + `main_*.jsx` bootstrap (not React Router for primary navigation).
- **Register** — Department operational UI for scanning/saving patient tests for a day.
- **Owner page** — Analytics dashboard for a department (KPIs, SLA, charts).
- **SoT** — Source of truth (Firestore documents).
- **Listener** — Firestore `onSnapshot` (usually via `trackedOnSnapshot`).
- Paths are repo-relative from project root unless noted.

## What This Audit Explicitly Does Not Do

- Does not modify application code  
- Does not recommend optimizations  
- Does not redesign architecture  
- Does not invent collections or fields not referenced in `src/`

---

## One-Paragraph System Summary

Mango is a **Vite multi-page React application** where each laboratory workstation (Registration, Haematology, Biochemistry, Backroom, Validator, Owner analytics, Inventory, etc.) loads its own HTML entry. Pages share one Firebase project (`vasundhara-4c6e5`) and a thin shared layer (`src/shared/**`) for day-scoped Firestore queries, register filters, and inventory subscriptions. Clinical workflow is **live-listener driven**: department UIs subscribe to `master_register` (often `array-contains` department) plus a department register collection, merge in memory, allow scan/save, update `report_details` stage flags, and optionally deduct inventory. Owner pages subscribe to day-scoped master + department collections and compute KPIs/SLA client-side. Auth is a simple `sessionStorage` login gate against a static user list—not Firebase Auth.
