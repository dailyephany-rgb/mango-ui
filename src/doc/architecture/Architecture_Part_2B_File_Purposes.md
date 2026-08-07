# Mango LIMS Architecture — Part 2B: File Purpose & Dependencies

[← Part 2 tables](./Architecture_Part_2_File_Inventory.md) · [Index](./README.md)

Expanded per-file purpose, key imports, and importers for all 213 `src` files.

## `src/Outsource.json`

- **Lines:** 208  
- **Purpose:** Static configuration / routing / reference data.  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (3):** `src/analytics/LabAnalytics.jsx`, `src/outsource/Outsource.jsx`, `src/owner/lib/dataFetcher_outsource.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/ValidatorUI/ValidatorDashboard.css`

- **Lines:** 271  
- **Purpose:** /* ===== General Layout ===== */  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/ValidatorUI/ValidatorDashboard.jsx`

- **Lines:** 353  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (10):** `react`, `firebase/firestore`, `../shared/firestore/trackedFirestore.js`, `../firebaseConfig.js`, `./ValidatorTable.jsx`, `../auth/UserMenu`, `../shared/config/collections.js`, `../shared/hooks/useRegisterFilters.js`, `../shared/utils/dates.js`, `../shared/utils/routineStageFlags.js`  
- **Imported by (1):** `src/main_validator.jsx`  
- **Controls / signals:** Firestore listeners, Firestore get reads, React effects  

## `src/ValidatorUI/ValidatorTable.jsx`

- **Lines:** 273  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (1):** `src/ValidatorUI/ValidatorDashboard.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/ValidatorUI/validatorConfig.js`

- **Lines:** 73  
- **Purpose:** // 🧪 Biochemistry + Hormones  
- **Exports:** validatorConfigs  
- **Imports from (4):** `../biochem_testRouting.json`, `../hormone_testRouting.json`, `../coag_testRouting.json`, `../backroom_routing.json`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/analytics/LabAnalytics.jsx`

- **Lines:** 452  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (8):** `react`, `../shared/firestore/trackedFirestore.js`, `./analyticsUtils`, `../Outsource.json`, `../inside_room_routing.json`, `../shared/utils/dates.js`, `../shared/firestore/scopedTimestampRangeQuery.js`, `../shared/cache/sessionQueryCache.js`  
- **Imported by (1):** `src/main_analytics.jsx`  
- **Controls / signals:** Firestore listeners, React effects  

## `src/analytics/analyticsUtils.js`

- **Lines:** 36  
- **Purpose:** // Initialize tests to 0  
- **Exports:** getCountByTest  
- **Imports from (1):** `./testRoutingMap.json`  
- **Imported by (1):** `src/analytics/LabAnalytics.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/analytics/css/LabAnalytics.css`

- **Lines:** 127  
- **Purpose:** Stylesheet for co-located UI module.  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/analytics/css/LabAnalytics1.css`

- **Lines:** 99  
- **Purpose:** Stylesheet for co-located UI module.  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/analytics/testRoutingMap.json`

- **Lines:** 289  
- **Purpose:** Static configuration / routing / reference data.  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (1):** `src/analytics/analyticsUtils.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/auth/AuthGuard.js`

- **Lines:** 17  
- **Purpose:** // AuthGuard.js  
- **Exports:** requireLogin  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/auth/LoginPage.css`

- **Lines:** 49  
- **Purpose:** Stylesheet for co-located UI module.  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/auth/LoginPage.jsx`

- **Lines:** 106  
- **Purpose:** // LoginPage.jsx  
- **Exports:** default  
- **Imports from (2):** `react`, `./users`  
- **Imported by (1):** `src/main_login.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/auth/UserMenu.jsx`

- **Lines:** 63  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (9):** `src/ValidatorUI/ValidatorDashboard.jsx`, `src/backroom/BackroomMain.jsx`, `src/biochem_main/BiochemistryMain.jsx`, `src/critical/CriticalAlertDashboard.jsx`, `src/haem/Haematology.jsx`, `src/mango.jsx`, `src/mango1.jsx`, `src/master_register_2/MasterView_Rectangle.jsx`, `src/outsource/Outsource.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/auth/users.js`

- **Lines:** 177  
- **Purpose:** // src/auth/users.js  
- **Exports:** departments, users  
- **Imports from (0):**   
- **Imported by (1):** `src/auth/LoginPage.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/backroom/Backroom.css`

- **Lines:** 442  
- **Purpose:** /* =============================== BACKROOM MAIN CONTAINER =================================*/  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/backroom/BackroomMain.jsx`

- **Lines:** 121  
- **Purpose:** // Individual register components  
- **Exports:** default  
- **Imports from (8):** `react`, `../auth/UserMenu`, `./ESRRegister.jsx`, `./BloodGroupRegister.jsx`, `./SerologyRegister.jsx`, `./RapidCardRegister.jsx`, `./UrineAnalysisRegister.jsx`, `../inventory/BackroomInventoryTab.jsx`  
- **Imported by (1):** `src/main_backroom.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/backroom/BloodGroupRegister.jsx`

- **Lines:** 504  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (10):** `react`, `../firebaseConfig`, `firebase/firestore`, `../shared/firestore/trackedFirestore.js`, `../shared/utils/dates.js`, `../shared/utils/source.js`, `../shared/hooks/usePersistedObjectState.js`, `../shared/hooks/useRegisterFilters.js`, `../shared/hooks/useScopedMasterEntries.js`, `../shared/components/RegisterFilterBar.jsx`  
- **Imported by (1):** `src/backroom/BackroomMain.jsx`  
- **Controls / signals:** Firestore listeners, React effects  

## `src/backroom/ESRRegister.jsx`

- **Lines:** 555  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (12):** `react`, `../firebaseConfig`, `firebase/firestore`, `../backroom_routing.json`, `../shared/utils/dates.js`, `../shared/utils/source.js`, `../shared/utils/ids.js`, `../shared/hooks/usePersistedObjectState.js`, `../shared/hooks/useRegisterFilters.js`, `../shared/hooks/useMasterDeptSnapshots.js`, `../shared/components/RegisterFilterBar.jsx`, `../shared/components/CriticalAlertModal.jsx`  
- **Imported by (1):** `src/backroom/BackroomMain.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/backroom/RapidCardRegister.jsx`

- **Lines:** 829  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (13):** `react`, `../firebaseConfig`, `firebase/firestore`, `../backroom_routing.json`, `../shared/utils/dates.js`, `../shared/utils/source.js`, `../shared/utils/ids.js`, `../shared/hooks/usePersistedObjectState.js`, `../shared/hooks/useRegisterFilters.js`, `../shared/hooks/useMasterDeptSnapshots.js`, `../shared/components/RegisterFilterBar.jsx`, `../shared/components/CriticalAlertModal.jsx`, `../inventory/inventorymapping`  
- **Imported by (1):** `src/backroom/BackroomMain.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/backroom/SerologyRegister.jsx`

- **Lines:** 641  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (13):** `react`, `../firebaseConfig`, `firebase/firestore`, `../backroom_routing.json`, `../shared/utils/dates.js`, `../shared/utils/source.js`, `../shared/utils/ids.js`, `../shared/hooks/usePersistedObjectState.js`, `../shared/hooks/useRegisterFilters.js`, `../shared/hooks/useMasterDeptSnapshots.js`, `../shared/components/RegisterFilterBar.jsx`, `../shared/components/CriticalAlertModal.jsx`, `../inventory/inventorymapping`  
- **Imported by (1):** `src/backroom/BackroomMain.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/backroom/UrineAnalysisRegister.jsx`

- **Lines:** 659  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (13):** `react`, `../firebaseConfig`, `firebase/firestore`, `../backroom_routing.json`, `../shared/utils/dates.js`, `../shared/utils/source.js`, `../shared/utils/ids.js`, `../shared/hooks/usePersistedObjectState.js`, `../shared/hooks/useRegisterFilters.js`, `../shared/hooks/useMasterDeptSnapshots.js`, `../shared/components/RegisterFilterBar.jsx`, `../shared/components/CriticalAlertModal.jsx`, `../inventory/inventorymapping`  
- **Imported by (1):** `src/backroom/BackroomMain.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/backroom_routing.json`

- **Lines:** 36  
- **Purpose:** Static configuration / routing / reference data.  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (7):** `src/ValidatorUI/validatorConfig.js`, `src/backroom/ESRRegister.jsx`, `src/backroom/RapidCardRegister.jsx`, `src/backroom/SerologyRegister.jsx`, `src/backroom/UrineAnalysisRegister.jsx`, `src/owner/lib/dataFetcher_rapid.js`, `src/owner/lib/dataFetcher_serology.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/backup/BackupEntry.css`

- **Lines:** 309  
- **Purpose:** /* =============================== TAB STYLING =================================*/  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/backup/BackupEntry.jsx`

- **Lines:** 368  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (7):** `react`, `../firebaseConfig`, `firebase/firestore`, `../shared/firestore/trackedFirestore.js`, `../inventory/inventorymapping`, `../inventory/BackupInventoryTab.jsx`, `../shared/utils/dates.js`  
- **Imported by (1):** `src/main_backup.jsx`  
- **Controls / signals:** Firestore listeners, React effects  

## `src/biochem_main/BiochemistryMain.css`

- **Lines:** 285  
- **Purpose:** /* =============================== BIOCHEMISTRY MAIN CONTAINER =================================*/  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/biochem_main/BiochemistryMain.jsx`

- **Lines:** 562  
- **Purpose:** // NEW IMPORTS FOR INVENTORY  
- **Exports:** default  
- **Imports from (19):** `react`, `../firebaseConfig.js`, `firebase/firestore`, `../biochem_testRouting.json`, `./HormonesMain.jsx`, `../inventory/DeptInventoryTab.jsx`, `../inventory/inventorymapping`, `../auth/Authguard.js`, `../auth/UserMenu`, `../inventory/InventoryAdjustmentTab.jsx`, `../shared/utils/dates.js`, `../shared/utils/source.js`, `../shared/utils/ids.js`, `../shared/utils/tests.js`, `../shared/hooks/usePersistedObjectState.js`, `../shared/hooks/useRegisterFilters.js`, `../shared/hooks/useMasterDeptSnapshots.js`, `../shared/components/RegisterFilterBar.jsx`, `../shared/components/CriticalAlertModal.jsx`  
- **Imported by (1):** `src/main_biochem.jsx`  
- **Controls / signals:** React effects  

## `src/biochem_main/HormonesMain.jsx`

- **Lines:** 482  
- **Purpose:** // NEW: Import inventory components and service  
- **Exports:** default  
- **Imports from (15):** `react`, `../firebaseConfig.js`, `firebase/firestore`, `../hormone_testRouting.json`, `../inventory/DeptInventoryTab.jsx`, `../inventory/inventorymapping`, `../shared/utils/dates.js`, `../shared/utils/source.js`, `../shared/utils/ids.js`, `../shared/utils/tests.js`, `../shared/hooks/usePersistedObjectState.js`, `../shared/hooks/useRegisterFilters.js`, `../shared/hooks/useMasterDeptSnapshots.js`, `../shared/components/RegisterFilterBar.jsx`, `../shared/components/CriticalAlertModal.jsx`  
- **Imported by (1):** `src/biochem_main/BiochemistryMain.jsx`  
- **Controls / signals:** React effects  

## `src/biochem_testRouting.json`

- **Lines:** 57  
- **Purpose:** Static configuration / routing / reference data.  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (3):** `src/ValidatorUI/validatorConfig.js`, `src/biochem_main/BiochemistryMain.jsx`, `src/owner/lib/dataFetcher_biochem_main.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/coag_testRouting.json`

- **Lines:** 15  
- **Purpose:** Static configuration / routing / reference data.  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (2):** `src/ValidatorUI/validatorConfig.js`, `src/coagulation/CoagulationMain.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/coagulation/CoagulationMain.css`

- **Lines:** 346  
- **Purpose:** /* =============================== COAGULATION MAIN CONTAINER =================================*/  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/coagulation/CoagulationMain.jsx`

- **Lines:** 855  
- **Purpose:** // --- IMPORT FOR DEDUCTION ---  
- **Exports:** default  
- **Imports from (15):** `react`, `../firebaseConfig.js`, `firebase/firestore`, `../coag_testRouting.json`, `../inventory/CoagulationInventoryTab`, `../inventory/inventorymapping`, `../shared/utils/dates.js`, `../shared/utils/source.js`, `../shared/utils/ids.js`, `../shared/utils/tests.js`, `../shared/hooks/usePersistedObjectState.js`, `../shared/hooks/useRegisterFilters.js`, `../shared/hooks/useMasterDeptSnapshots.js`, `../shared/components/RegisterFilterBar.jsx`, `../shared/components/CriticalAlertModal.jsx`  
- **Imported by (1):** `src/main_coag.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/critical/CriticalAlertDashboard.jsx`

- **Lines:** 435  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (7):** `react`, `../firebaseConfig`, `firebase/firestore`, `../shared/firestore/trackedFirestore.js`, `jspdf`, `../auth/UserMenu`, `../shared/utils/dates.js`  
- **Imported by (1):** `src/main_critical.jsx`  
- **Controls / signals:** Firestore listeners, React effects  

## `src/critical/CriticalDashboard.css`

- **Lines:** 310  
- **Purpose:** /* Container to match ESR Register Wrapper */  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/doc/listener-counts-2026-08-02.json`

- **Lines:** 634  
- **Purpose:** Static configuration / routing / reference data.  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** Firestore get reads  

## `src/firebaseConfig.js`

- **Lines:** 51  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** db  
- **Imports from (2):** `firebase/app`, `firebase/firestore`  
- **Imported by (50):** `src/ValidatorUI/ValidatorDashboard.jsx`, `src/backroom/BloodGroupRegister.jsx`, `src/backroom/ESRRegister.jsx`, `src/backroom/RapidCardRegister.jsx`, `src/backroom/SerologyRegister.jsx`, `src/backroom/UrineAnalysisRegister.jsx`, `src/backup/BackupEntry.jsx`, `src/biochem_main/BiochemistryMain.jsx`, `src/biochem_main/HormonesMain.jsx`, `src/coagulation/CoagulationMain.jsx`, `src/critical/CriticalAlertDashboard.jsx`, `src/haem/Haematology.jsx`, `src/inside_lab/InsideLab.jsx`, `src/inventory-command-center/InventoryCommandCenter.jsx`, `src/inventory-command-center/utils/consumptionledger.js` …  
- **Controls / signals:** module definitions / UI / config  

## `src/haem/Haematology.css`

- **Lines:** 446  
- **Purpose:** Stylesheet for co-located UI module.  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/haem/Haematology.jsx`

- **Lines:** 647  
- **Purpose:** // Import Inventory Deduction Logic  
- **Exports:** default  
- **Imports from (16):** `react`, `../firebaseConfig.js`, `firebase/firestore`, `../inventory/inventorymapping`, `../inventory/HaemInventoryTab.jsx`, `../auth/UserMenu`, `../shared/firestore/subscribeInventoryByMachines.js`, `../shared/utils/dates.js`, `../shared/utils/source.js`, `../shared/utils/ids.js`, `../shared/utils/tests.js`, `../shared/hooks/usePersistedObjectState.js`, `../shared/hooks/useRegisterFilters.js`, `../shared/hooks/useMasterDeptSnapshots.js`, `../shared/components/RegisterFilterBar.jsx`, `../shared/components/CriticalAlertModal.jsx`  
- **Imported by (1):** `src/main_haem.jsx`  
- **Controls / signals:** React effects  

## `src/hormone_testRouting.json`

- **Lines:** 39  
- **Purpose:** Static configuration / routing / reference data.  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (2):** `src/ValidatorUI/validatorConfig.js`, `src/biochem_main/HormonesMain.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/inside_lab/InsideLab.css`

- **Lines:** 151  
- **Purpose:** /* --- REGISTER & FILTERS --- */  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/inside_lab/InsideLab.jsx`

- **Lines:** 497  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (9):** `react`, `../firebaseConfig`, `firebase/firestore`, `../shared/firestore/trackedFirestore.js`, `../inside_room_routing.json`, `../shared/utils/dates.js`, `../shared/hooks/useRegisterFilters.js`, `../shared/hooks/useScopedMasterEntries.js`, `../shared/components/RegisterFilterBar.jsx`  
- **Imported by (1):** `src/main_inside_lab.jsx`  
- **Controls / signals:** Firestore listeners, Firestore get reads, React effects  

## `src/inside_room_routing.json`

- **Lines:** 49  
- **Purpose:** Static configuration / routing / reference data.  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (3):** `src/analytics/LabAnalytics.jsx`, `src/inside_lab/InsideLab.jsx`, `src/owner/lib/dataFetcher_lab.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory-command-center/InventoryCommandCenter.jsx`

- **Lines:** 336  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (14):** `react`, `firebase/firestore`, `../shared/firestore/trackedFirestore.js`, `../firebaseConfig.js`, `../shared/utils/dates.js`, `../shared/firestore/scopedTimestampRangeQuery.js`, `../shared/firestore/subscribeInventoryByMachines.js`, `../shared/cache/sessionQueryCache.js`, `./tabs/LiveInventoryTab`, `./tabs/ExpirySurveillanceTab`, `./tabs/QCMonitorTab`, `./tabs/ConsumptionLedgerTab`, `./tabs/CostAnalyticsTab`, `./tabs/ConsumedInventoryTab`  
- **Imported by (1):** `src/main_commandcenter.jsx`  
- **Controls / signals:** Firestore listeners, React effects  

## `src/inventory-command-center/commandcenter.css`

- **Lines:** 327  
- **Purpose:** /* ========================= COMMAND CENTER ROOT ========================= */  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory-command-center/components/CommandCenterHeader.jsx`

- **Lines:** 44  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory-command-center/components/DateRangeFilter.jsx`

- **Lines:** 38  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (5):** `src/inventory-command-center/tabs/ComboConsumptionLedgerTab.jsx`, `src/inventory-command-center/tabs/ConsumedInventoryTab.jsx`, `src/inventory-command-center/tabs/ConsumptionLedgerTab.jsx`, `src/inventory-command-center/tabs/CostAnalyticsTab.jsx`, `src/inventory-command-center/tabs/QCMonitorTab.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory-command-center/components/DepartmentFilter.jsx`

- **Lines:** 40  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (1):** `src/inventory-command-center/tabs/ExpirySurveillanceTab.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory-command-center/components/EmergencyBadge.jsx`

- **Lines:** 32  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (3):** `src/inventory-command-center/tabs/ExpirySurveillanceTab.jsx`, `src/inventory-command-center/tabs/LiveInventoryTab.jsx`, `src/inventory-command-center/tabs/QCMonitorTab.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory-command-center/components/HealthIndicator.jsx`

- **Lines:** 69  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory-command-center/components/MetricCard.jsx`

- **Lines:** 27  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (3):** `src/inventory-command-center/tabs/ExpirySurveillanceTab.jsx`, `src/inventory-command-center/tabs/LiveInventoryTab.jsx`, `src/inventory-command-center/tabs/QCMonitorTab.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory-command-center/config/inventoryThresholds.js`

- **Lines:** 15  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** inventoryThresholds  
- **Imports from (0):**   
- **Imported by (1):** `src/inventory-command-center/utils/inventoryAggregations.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory-command-center/tabs/ComboConsumptionLedgerTab.jsx`

- **Lines:** 1048  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (2):** `react`, `../components/DateRangeFilter`  
- **Imported by (1):** `src/inventory-command-center/tabs/ConsumptionLedgerTab.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory-command-center/tabs/ConsumedInventoryTab.jsx`

- **Lines:** 589  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (2):** `react`, `../components/DateRangeFilter`  
- **Imported by (1):** `src/inventory-command-center/InventoryCommandCenter.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory-command-center/tabs/ConsumptionLedgerTab.jsx`

- **Lines:** 947  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (3):** `react`, `../components/DateRangeFilter`, `./ComboConsumptionLedgerTab`  
- **Imported by (1):** `src/inventory-command-center/InventoryCommandCenter.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory-command-center/tabs/CostAnalyticsTab.jsx`

- **Lines:** 998  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (2):** `react`, `../components/DateRangeFilter`  
- **Imported by (1):** `src/inventory-command-center/InventoryCommandCenter.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory-command-center/tabs/ExpirySurveillanceTab.jsx`

- **Lines:** 252  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (5):** `react`, `../components/EmergencyBadge`, `../components/MetricCard`, `../components/DepartmentFilter`, `../utils/Expiryutils`  
- **Imported by (1):** `src/inventory-command-center/InventoryCommandCenter.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory-command-center/tabs/LiveInventoryTab.jsx`

- **Lines:** 285  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (4):** `react`, `../utils/inventoryAggregations`, `../components/MetricCard`, `../components/EmergencyBadge`  
- **Imported by (1):** `src/inventory-command-center/InventoryCommandCenter.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory-command-center/tabs/QCMonitorTab.jsx`

- **Lines:** 1014  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (5):** `react`, `../components/EmergencyBadge`, `../components/MetricCard`, `../components/DateRangeFilter`, `../utils/qcUtils`  
- **Imported by (1):** `src/inventory-command-center/InventoryCommandCenter.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory-command-center/utils/Expiryutils.js`

- **Lines:** 74  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** calculateDaysLeft, filterExpiringInventory, getRiskLabel, isExpiringSoon  
- **Imports from (0):**   
- **Imported by (1):** `src/inventory-command-center/tabs/ExpirySurveillanceTab.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory-command-center/utils/consumptionledger.js`

- **Lines:** 42  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** addConsumptionLedgerEntry  
- **Imports from (2):** `firebase/firestore`, `../../firebaseConfig`  
- **Imported by (6):** `src/inventory/BackroomInventoryTab.jsx`, `src/inventory/BackupInventoryTab.jsx`, `src/inventory/CoagulationInventoryTab.jsx`, `src/inventory/DeptInventoryTab.jsx`, `src/inventory/HaemInventoryTab.jsx`, `src/inventory/inventorymapping.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory-command-center/utils/inventoryAggregations.js`

- **Lines:** 94  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** buildInventoryRows  
- **Imports from (1):** `../config/inventoryThresholds`  
- **Imported by (1):** `src/inventory-command-center/tabs/LiveInventoryTab.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory-command-center/utils/ledgerUtils.js`

- **Lines:** 103  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** calculateTotalConsumption, getTopConsumedReagent, groupConsumptionByDepartment, groupConsumptionByReagent  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory-command-center/utils/qcUtils.js`

- **Lines:** 69  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** calculateQCFailureCount, formatQCStatus, groupQCByDepartment, isQCFailure  
- **Imports from (0):**   
- **Imported by (1):** `src/inventory-command-center/tabs/QCMonitorTab.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory/BackroomInventoryTab.jsx`

- **Lines:** 1555  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (5):** `react`, `../firebaseConfig`, `firebase/firestore`, `../inventory-command-center/utils/consumptionledger`, `../shared/firestore/subscribeInventoryByMachines.js`  
- **Imported by (1):** `src/backroom/BackroomMain.jsx`  
- **Controls / signals:** React effects  

## `src/inventory/BackupInventoryTab.jsx`

- **Lines:** 1675  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (6):** `react`, `../firebaseConfig`, `firebase/firestore`, `../inventory/inventorymapping`, `../inventory-command-center/utils/consumptionledger`, `../shared/firestore/subscribeInventoryByMachines.js`  
- **Imported by (1):** `src/backup/BackupEntry.jsx`  
- **Controls / signals:** React effects  

## `src/inventory/CoagulationInventoryTab.jsx`

- **Lines:** 1419  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (5):** `react`, `../firebaseConfig`, `firebase/firestore`, `../inventory-command-center/utils/consumptionledger`, `../shared/firestore/subscribeInventoryByMachines.js`  
- **Imported by (1):** `src/coagulation/CoagulationMain.jsx`  
- **Controls / signals:** React effects  

## `src/inventory/DeptInventory.css`

- **Lines:** 217  
- **Purpose:** /* Added for the confirm button */  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory/DeptInventoryTab.jsx`

- **Lines:** 1787  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (5):** `react`, `../firebaseConfig`, `firebase/firestore`, `../inventory-command-center/utils/consumptionledger`, `../shared/firestore/subscribeInventoryByMachines.js`  
- **Imported by (2):** `src/biochem_main/BiochemistryMain.jsx`, `src/biochem_main/HormonesMain.jsx`  
- **Controls / signals:** React effects  

## `src/inventory/HaemInventoryTab.jsx`

- **Lines:** 1535  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (5):** `react`, `../firebaseConfig`, `firebase/firestore`, `../inventory-command-center/utils/consumptionledger`, `../shared/firestore/subscribeInventoryByMachines.js`  
- **Imported by (1):** `src/haem/Haematology.jsx`  
- **Controls / signals:** React effects  

## `src/inventory/InventoryAdjustmentTab.jsx`

- **Lines:** 473  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (5):** `react`, `firebase/firestore`, `../shared/firestore/trackedFirestore.js`, `../firebaseConfig`, `../shared/cache/staticConfigCache.js`  
- **Imported by (1):** `src/biochem_main/BiochemistryMain.jsx`  
- **Controls / signals:** Firestore listeners, React effects  

## `src/inventory/InventoryCommandCentre.jsx`

- **Lines:** 35  
- **Purpose:** /* Logic to aggregate data from inventory_master and inventory_logs */  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory/InventoryIntake.css`

- **Lines:** 236  
- **Purpose:** /* 1. GLOBAL RESET */  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/inventory/InventoryIntake.jsx`

- **Lines:** 508  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (5):** `react`, `../firebaseConfig`, `firebase/firestore`, `../shared/firestore/trackedFirestore.js`, `./reagents.json`  
- **Imported by (1):** `src/main_inventory.jsx`  
- **Controls / signals:** Firestore listeners, React effects  

## `src/inventory/inventorymapping.js`

- **Lines:** 775  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** getVitrosDeductibleTests, handleInventoryDeduction, testToReagentMap  
- **Imports from (5):** `../firebaseConfig`, `firebase/firestore`, `../shared/firestore/trackedFirestore.js`, `../inventory-command-center/utils/consumptionledger`, `../shared/cache/staticConfigCache.js`  
- **Imported by (9):** `src/backroom/RapidCardRegister.jsx`, `src/backroom/SerologyRegister.jsx`, `src/backroom/UrineAnalysisRegister.jsx`, `src/backup/BackupEntry.jsx`, `src/biochem_main/BiochemistryMain.jsx`, `src/biochem_main/HormonesMain.jsx`, `src/coagulation/CoagulationMain.jsx`, `src/haem/Haematology.jsx`, `src/inventory/BackupInventoryTab.jsx`  
- **Controls / signals:** Firestore get reads  

## `src/inventory/reagents.json`

- **Lines:** 292  
- **Purpose:** Static configuration / routing / reference data.  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (1):** `src/inventory/InventoryIntake.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/main.jsx`

- **Lines:** 82  
- **Purpose:** /* 🌟 Simple Top Navigation Bar */  
- **Exports:** —  
- **Imports from (5):** `react`, `react-dom/client`, `./mango.jsx`, `./master/MasterView_Table.jsx`, `./master_register_2/MasterView_Rectangle.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_analytics.jsx`

- **Lines:** 17  
- **Purpose:** Vite MPA bootstrap: createRoot for an HTML entry.  
- **Exports:** —  
- **Imports from (4):** `react`, `react-dom/client`, `./owner/OwnerContext.jsx`, `./analytics/LabAnalytics.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_backroom.jsx`

- **Lines:** 11  
- **Purpose:** Vite MPA bootstrap: createRoot for an HTML entry.  
- **Exports:** —  
- **Imports from (3):** `react`, `react-dom/client`, `./backroom/BackroomMain.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_backup.jsx`

- **Lines:** 10  
- **Purpose:** Vite MPA bootstrap: createRoot for an HTML entry.  
- **Exports:** —  
- **Imports from (3):** `react`, `react-dom/client`, `./backup/BackupEntry.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_biochem.jsx`

- **Lines:** 11  
- **Purpose:** Vite MPA bootstrap: createRoot for an HTML entry.  
- **Exports:** —  
- **Imports from (3):** `react`, `react-dom/client`, `./biochem_main/BiochemistryMain.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_coag.jsx`

- **Lines:** 11  
- **Purpose:** Vite MPA bootstrap: createRoot for an HTML entry.  
- **Exports:** —  
- **Imports from (3):** `react`, `react-dom/client`, `./coagulation/CoagulationMain.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_commandcenter.jsx`

- **Lines:** 39  
- **Purpose:** Vite MPA bootstrap: createRoot for an HTML entry.  
- **Exports:** —  
- **Imports from (4):** `react`, `react-dom/client`, `./owner/OwnerContext.jsx`, `./inventory-command-center/InventoryCommandCenter.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_critical.jsx`

- **Lines:** 10  
- **Purpose:** Vite MPA bootstrap: createRoot for an HTML entry.  
- **Exports:** —  
- **Imports from (3):** `react`, `react-dom/client`, `./critical/CriticalAlertDashboard.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_haem.jsx`

- **Lines:** 12  
- **Purpose:** // 🩸 This is the entry point for Haematology Department UI  
- **Exports:** —  
- **Imports from (3):** `react`, `react-dom/client`, `./haem/Haematology.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_inside_lab.jsx`

- **Lines:** 15  
- **Purpose:** Vite MPA bootstrap: createRoot for an HTML entry.  
- **Exports:** —  
- **Imports from (3):** `react`, `react-dom/client`, `./inside_lab/InsideLab.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_inventory.jsx`

- **Lines:** 19  
- **Purpose:** // Added the missing import for OwnerProvider  
- **Exports:** —  
- **Imports from (4):** `react`, `react-dom/client`, `./owner/OwnerContext.jsx`, `./inventory/InventoryIntake.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_login.jsx`

- **Lines:** 10  
- **Purpose:** Vite MPA bootstrap: createRoot for an HTML entry.  
- **Exports:** —  
- **Imports from (3):** `react`, `react-dom/client`, `./auth/LoginPage`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_master_admin.jsx`

- **Lines:** 20  
- **Purpose:** // src/main_master_admin.jsx  
- **Exports:** —  
- **Imports from (4):** `react`, `react-dom/client`, `./owner/OwnerContext.jsx`, `./master_admin/MasterAdmin.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_outsource.jsx`

- **Lines:** 15  
- **Purpose:** Vite MPA bootstrap: createRoot for an HTML entry.  
- **Exports:** —  
- **Imports from (3):** `react`, `react-dom/client`, `./outsource/Outsource.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_owner.jsx`

- **Lines:** 19  
- **Purpose:** // src/owner/main_owner.jsx  
- **Exports:** —  
- **Imports from (4):** `react`, `react-dom/client`, `./owner/OwnerContext.jsx`, `./owner/OwnerApp.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_owner_biochem.jsx`

- **Lines:** 16  
- **Purpose:** Vite MPA bootstrap: createRoot for an HTML entry.  
- **Exports:** —  
- **Imports from (4):** `react`, `react-dom/client`, `./owner/OwnerBiochem.jsx`, `./owner/OwnerContext.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_owner_blood_group.jsx`

- **Lines:** 18  
- **Purpose:** Vite MPA bootstrap: createRoot for an HTML entry.  
- **Exports:** —  
- **Imports from (4):** `react`, `react-dom/client`, `./owner/OwnerContext.jsx`, `./owner/OwnerBloodGroup.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_owner_bloodgroup.jsx`

- **Lines:** 15  
- **Purpose:** Vite MPA bootstrap: createRoot for an HTML entry.  
- **Exports:** —  
- **Imports from (4):** `react`, `react-dom/client`, `./owner/OwnerBloodGroup.jsx`, `./owner/OwnerContext.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_owner_coag.jsx`

- **Lines:** 21  
- **Purpose:** // src/main_owner_coag.jsx  
- **Exports:** —  
- **Imports from (4):** `react`, `react-dom/client`, `./owner/OwnerContext.jsx`, `./owner/OwnerCoag.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_owner_esr.jsx`

- **Lines:** 21  
- **Purpose:** // src/main_owner_esr.jsx  
- **Exports:** —  
- **Imports from (4):** `react`, `react-dom/client`, `./owner/OwnerContext.jsx`, `./owner/OwnerESRPage.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_owner_haem.jsx`

- **Lines:** 25  
- **Purpose:** // ----------------------------------------------------------  
- **Exports:** —  
- **Imports from (4):** `react`, `react-dom/client`, `./owner/OwnerContext.jsx`, `./owner/OwnerHaemPage.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_owner_hormones.jsx`

- **Lines:** 22  
- **Purpose:** // src/main_owner_hormones.jsx  
- **Exports:** —  
- **Imports from (4):** `react`, `react-dom/client`, `./owner/OwnerContext.jsx`, `./owner/OwnerHormones.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_owner_lab.jsx`

- **Lines:** 16  
- **Purpose:** Vite MPA bootstrap: createRoot for an HTML entry.  
- **Exports:** —  
- **Imports from (4):** `react`, `react-dom/client`, `./owner/OwnerLabPage.jsx`, `./owner/OwnerContext.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_owner_outsource.jsx`

- **Lines:** 17  
- **Purpose:** Vite MPA bootstrap: createRoot for an HTML entry.  
- **Exports:** —  
- **Imports from (4):** `react`, `react-dom/client`, `./owner/OwnerOutsourcePage.jsx`, `./owner/OwnerContext.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_owner_rapid.jsx`

- **Lines:** 18  
- **Purpose:** Vite MPA bootstrap: createRoot for an HTML entry.  
- **Exports:** —  
- **Imports from (4):** `react`, `react-dom/client`, `./owner/OwnerContext.jsx`, `./owner/OwnerRapidPage.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_owner_serology.jsx`

- **Lines:** 21  
- **Purpose:** // src/main_owner_serology.jsx  
- **Exports:** —  
- **Imports from (4):** `react`, `react-dom/client`, `./owner/OwnerContext.jsx`, `./owner/OwnerSerology.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_owner_urine.jsx`

- **Lines:** 15  
- **Purpose:** Vite MPA bootstrap: createRoot for an HTML entry.  
- **Exports:** —  
- **Imports from (4):** `react`, `react-dom/client`, `./owner/OwnerContext.jsx`, `./owner/OwnerUrine.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_performance.jsx`

- **Lines:** 10  
- **Purpose:** Vite MPA bootstrap: createRoot for an HTML entry.  
- **Exports:** —  
- **Imports from (3):** `react`, `react-dom/client`, `./performance/PerformanceDashboard.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/main_validator.jsx`

- **Lines:** 12  
- **Purpose:** Vite MPA bootstrap: createRoot for an HTML entry.  
- **Exports:** —  
- **Imports from (3):** `react`, `react-dom/client`, `./ValidatorUI/ValidatorDashboard.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/mango.css`

- **Lines:** 271  
- **Purpose:** /* 🌼 Overall Layout */  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/mango.jsx`

- **Lines:** 698  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (6):** `react`, `./firebaseConfig.js`, `./test_mapping.json`, `firebase/firestore`, `./shared/firestore/trackedFirestore.js`, `./auth/UserMenu`  
- **Imported by (1):** `src/main.jsx`  
- **Controls / signals:** Firestore get reads, React effects  

## `src/mango1.jsx`

- **Lines:** 592  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (6):** `react`, `./firebaseConfig.js`, `./test_mapping.json`, `firebase/firestore`, `./shared/firestore/trackedFirestore.js`, `./auth/UserMenu`  
- **Imported by (0):** —  
- **Controls / signals:** Firestore get reads, React effects  

## `src/master/MasterView_Table.css`

- **Lines:** 227  
- **Purpose:** /* ============================================================ MASTER CONTAINER ============================================================ */  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/master/MasterView_Table.jsx`

- **Lines:** 169  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (4):** `react`, `../firebaseConfig.js`, `firebase/firestore`, `../shared/hooks/useMasterRegisterSnapshots.js`  
- **Imported by (1):** `src/main.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/master/MasterView_Table1.jsx`

- **Lines:** 173  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (5):** `react`, `../firebaseConfig.js`, `firebase/firestore`, `../shared/firestore/trackedFirestore.js`, `../shared/utils/dates.js`  
- **Imported by (0):** —  
- **Controls / signals:** Firestore listeners, React effects  

## `src/master_admin/MasterAdmin.css`

- **Lines:** 254  
- **Purpose:** /* ============================================================ MASTER CONTAINER & FONTS ============================================================ */  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/master_admin/MasterAdmin.jsx`

- **Lines:** 604  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (6):** `react`, `../firebaseConfig`, `firebase/firestore`, `../shared/firestore/trackedFirestore.js`, `xlsx`, `../shared/config/collections.js`  
- **Imported by (1):** `src/main_master_admin.jsx`  
- **Controls / signals:** Firestore listeners, React effects  

## `src/master_admin/MasterAdmin1.jsx`

- **Lines:** 585  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (6):** `react`, `../firebaseConfig`, `firebase/firestore`, `../shared/firestore/trackedFirestore.js`, `xlsx`, `../shared/config/collections.js`  
- **Imported by (0):** —  
- **Controls / signals:** Firestore listeners, React effects  

## `src/master_register_2/MasterView_Rectangle.css`

- **Lines:** 666  
- **Purpose:** /* === Master Register Card View Styling === */  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/master_register_2/MasterView_Rectangle.jsx`

- **Lines:** 1090  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (7):** `react`, `../firebaseConfig.js`, `firebase/firestore`, `../shared/firestore/trackedFirestore.js`, `../auth/UserMenu`, `../shared/utils/dates.js`, `../shared/utils/routineStageFlags.js`  
- **Imported by (1):** `src/main.jsx`  
- **Controls / signals:** Firestore listeners, React effects  

## `src/master_register_2/main.jsx`

- **Lines:** 81  
- **Purpose:** /* 🌟 Simple Top Navigation Bar */  
- **Exports:** —  
- **Imports from (5):** `react`, `react-dom/client`, `./mango.jsx`, `./master/MasterView_Table.jsx`, `./master_register_2/MasterView_Rectangle.jsx`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/outsource/Outsource.css`

- **Lines:** 273  
- **Purpose:** /* Header Styling */  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/outsource/Outsource.jsx`

- **Lines:** 671  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (10):** `react`, `../firebaseConfig`, `firebase/firestore`, `../shared/firestore/trackedFirestore.js`, `../Outsource.json`, `../auth/UserMenu`, `../shared/utils/dates.js`, `../shared/hooks/usePersistedObjectState.js`, `../shared/hooks/useRegisterFilters.js`, `../shared/hooks/useScopedMasterEntries.js`  
- **Imported by (1):** `src/main_outsource.jsx`  
- **Controls / signals:** Firestore listeners, Firestore get reads, React effects  

## `src/owner/OwnerApp.jsx`

- **Lines:** 193  
- **Purpose:** // src/owner/OwnerApp.jsx  
- **Exports:** default  
- **Imports from (7):** `react`, `./components/DateSourceFilter`, `./OwnerContext.jsx`, `./workflow/WorkflowKPIBlocks`, `./workflow/WorkflowStackedBars`, `./workflow/WorkflowStaffDistribution`, `./workflow/workflowfetcher`  
- **Imported by (1):** `src/main_owner.jsx`  
- **Controls / signals:** React effects  

## `src/owner/OwnerBiochem.jsx`

- **Lines:** 767  
- **Purpose:** Owner analytics page UI.  
- **Exports:** default  
- **Imports from (15):** `react`, `./OwnerContext.jsx`, `./components/DateSourceFilter`, `./components/KPIBlocks`, `./components/DelayTable`, `./components/PatientListModal`, `./charts/CountsBar`, `./charts/StackedStageLines`, `./charts/TimeBricks`, `./charts/DelayHistogram`, `./charts/SLAScoreDonut`, `./charts/StaffDistribution`, `./charts/StaffAvgCards`, `./charts/StaffTimeline`, `./lib/dataFetcher_biochem_main`  
- **Imported by (1):** `src/main_owner_biochem.jsx`  
- **Controls / signals:** React effects  

## `src/owner/OwnerBloodGroup.jsx`

- **Lines:** 835  
- **Purpose:** // src/owner/OwnerBloodGroupPage.jsx  
- **Exports:** default  
- **Imports from (16):** `react`, `./OwnerContext.jsx`, `./components/DateSourceFilter`, `./components/KPIBlocks_BloodGroup`, `./components/PatientListModal`, `./components/DelayTable`, `./charts/CountsBar`, `./charts/StackedStageLines`, `./charts/TimeBricks`, `./charts/DelayHistogram`, `./charts/SLAScoreDonut`, `./charts/StaffDistribution`, `./charts/StaffAvgCards`, `./charts/StaffTimeline`, `./lib/dataFetcher_bloodgroup_testing.js`, `./lib/dataFetcher_bloodgroup_retesting.js`  
- **Imported by (2):** `src/main_owner_blood_group.jsx`, `src/main_owner_bloodgroup.jsx`  
- **Controls / signals:** React effects  

## `src/owner/OwnerCoag.jsx`

- **Lines:** 836  
- **Purpose:** // ------------------------------------------------------  
- **Exports:** default  
- **Imports from (15):** `react`, `./OwnerContext.jsx`, `./components/DateSourceFilter`, `./components/KPIBlocks`, `./components/PatientListModal`, `./components/DelayTable`, `./charts/CountsBar`, `./charts/StackedStageLines`, `./charts/TimeBricks`, `./charts/DelayHistogram`, `./charts/SLAScoreDonut`, `./charts/StaffDistribution`, `./charts/StaffAvgCards`, `./charts/StaffTimeline`, `./lib/dataFetcher.js`  
- **Imported by (1):** `src/main_owner_coag.jsx`  
- **Controls / signals:** React effects  

## `src/owner/OwnerContext.jsx`

- **Lines:** 29  
- **Purpose:** Owner analytics page UI.  
- **Exports:** OwnerContext, OwnerProvider  
- **Imports from (1):** `react`  
- **Imported by (30):** `src/main_analytics.jsx`, `src/main_commandcenter.jsx`, `src/main_inventory.jsx`, `src/main_master_admin.jsx`, `src/main_owner.jsx`, `src/main_owner_biochem.jsx`, `src/main_owner_blood_group.jsx`, `src/main_owner_bloodgroup.jsx`, `src/main_owner_coag.jsx`, `src/main_owner_esr.jsx`, `src/main_owner_haem.jsx`, `src/main_owner_hormones.jsx`, `src/main_owner_lab.jsx`, `src/main_owner_outsource.jsx`, `src/main_owner_rapid.jsx` …  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/OwnerESRPage.jsx`

- **Lines:** 819  
- **Purpose:** // ------------------------------------------------------  
- **Exports:** default  
- **Imports from (15):** `react`, `../owner/OwnerContext.jsx`, `../owner/components/DateSourceFilter`, `../owner/components/KPIBlocks`, `../owner/components/DelayTable`, `../owner/components/PatientListModal`, `../owner/charts/CountsBar`, `../owner/charts/StackedStageLines`, `../owner/charts/TimeBricks`, `../owner/charts/DelayHistogram`, `../owner/charts/SLAScoreDonut`, `../owner/charts/StaffDistribution`, `../owner/charts/StaffAvgCards`, `../owner/charts/StaffTimeline`, `../owner/lib/dataFetcher_esr.js`  
- **Imported by (1):** `src/main_owner_esr.jsx`  
- **Controls / signals:** React effects  

## `src/owner/OwnerHaemPage.jsx`

- **Lines:** 790  
- **Purpose:** Owner analytics page UI.  
- **Exports:** default  
- **Imports from (15):** `react`, `./OwnerContext.jsx`, `./components/DateSourceFilter`, `./components/KPIBlocks`, `./components/PatientListModal`, `./components/DelayTable`, `./charts/CountsBar`, `./charts/StackedStageLines`, `./charts/TimeBricks`, `./charts/DelayHistogram`, `./charts/SLAScoreDonut`, `./charts/StaffDistribution`, `./charts/StaffAvgCards`, `./charts/StaffTimeline`, `./lib/dataFetcher_haem.js`  
- **Imported by (1):** `src/main_owner_haem.jsx`  
- **Controls / signals:** React effects  

## `src/owner/OwnerHormones.jsx`

- **Lines:** 801  
- **Purpose:** Owner analytics page UI.  
- **Exports:** default  
- **Imports from (15):** `react`, `./OwnerContext.jsx`, `./components/DateSourceFilter`, `./components/KPIBlocks`, `./components/DelayTable`, `./components/PatientListModal`, `./charts/CountsBar`, `./charts/StackedStageLines`, `./charts/TimeBricks`, `./charts/DelayHistogram`, `./charts/SLAScoreDonut`, `./charts/StaffDistribution`, `./charts/StaffAvgCards`, `./charts/StaffTimeline`, `./lib/dataFetcher_hormones_main`  
- **Imported by (1):** `src/main_owner_hormones.jsx`  
- **Controls / signals:** React effects  

## `src/owner/OwnerLabPage.jsx`

- **Lines:** 183  
- **Purpose:** Owner analytics page UI.  
- **Exports:** default  
- **Imports from (14):** `react`, `../owner/OwnerContext.jsx`, `../owner/components/DateSourceFilter`, `../owner/components/KPIBlocksInside`, `../owner/components/DelayTable`, `../owner/components/PatientListModalInside`, `../owner/charts/CountsBarInside`, `../owner/charts/StackedStageLinesInside`, `../owner/charts/TimeBricks`, `../owner/charts/SLAScoreDonut`, `../owner/charts/DelayHistogram`, `../owner/charts/StaffDistribution`, `../owner/lib/dataFetcher_lab.js`, `../owner/data/test_timings.json`  
- **Imported by (1):** `src/main_owner_lab.jsx`  
- **Controls / signals:** React effects  

## `src/owner/OwnerOutsourcePage.jsx`

- **Lines:** 616  
- **Purpose:** Owner analytics page UI.  
- **Exports:** default  
- **Imports from (14):** `react`, `../owner/OwnerContext.jsx`, `../owner/components/DateSourceFilter`, `../owner/components/KPIBlocksOutsource`, `../owner/components/DelayTable`, `../owner/components/PatientListModalOutsource`, `../owner/charts/CountsBarOutsource`, `../owner/charts/StackedStageLinesOutsource`, `../owner/charts/TimeBricksOutsource`, `../owner/charts/SLAScoreDonut`, `../owner/charts/DelayHistogram`, `../owner/charts/StaffDistribution`, `../owner/lib/dataFetcher_outsource.js`, `../owner/data/test_timings.json`  
- **Imported by (1):** `src/main_owner_outsource.jsx`  
- **Controls / signals:** React effects  

## `src/owner/OwnerRapidPage.jsx`

- **Lines:** 814  
- **Purpose:** // src/owner_ui/OwnerRapidPage.jsx  
- **Exports:** default  
- **Imports from (15):** `react`, `../owner/OwnerContext.jsx`, `../owner/components/DateSourceFilter`, `../owner/components/KPIBlocks`, `../owner/components/PatientListModal`, `../owner/components/DelayTable`, `../owner/charts/CountsBar`, `../owner/charts/StackedStageLines`, `../owner/charts/TimeBricks`, `../owner/charts/DelayHistogram`, `../owner/charts/SLAScoreDonut`, `../owner/charts/StaffDistribution`, `../owner/charts/StaffAvgCards`, `../owner/charts/StaffTimeline`, `../owner/lib/dataFetcher_rapid.js`  
- **Imported by (1):** `src/main_owner_rapid.jsx`  
- **Controls / signals:** React effects  

## `src/owner/OwnerSerology.jsx`

- **Lines:** 862  
- **Purpose:** // src/owner/OwnerSerology.jsx  
- **Exports:** default  
- **Imports from (15):** `react`, `./OwnerContext.jsx`, `./components/DateSourceFilter`, `./components/KPIBlocks`, `./components/PatientListModal`, `./components/DelayTable`, `./charts/CountsBar`, `./charts/StackedStageLines`, `./charts/TimeBricks`, `./charts/DelayHistogram`, `./charts/SLAScoreDonut`, `./charts/StaffDistribution`, `./charts/StaffAvgCards`, `./charts/StaffTimeline`, `./lib/dataFetcher_serology.js`  
- **Imported by (1):** `src/main_owner_serology.jsx`  
- **Controls / signals:** React effects  

## `src/owner/OwnerUI.css`

- **Lines:** 189  
- **Purpose:** /* src/owner/OwnerUI.css */  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/OwnerUrine.jsx`

- **Lines:** 820  
- **Purpose:** // src/owner_ui/OwnerUrinePage.jsx  
- **Exports:** default  
- **Imports from (15):** `react`, `../owner/OwnerContext.jsx`, `../owner/components/DateSourceFilter`, `../owner/components/KPIBlocks`, `../owner/components/PatientListModal`, `../owner/components/DelayTable`, `../owner/charts/CountsBar`, `../owner/charts/StackedStageLines`, `../owner/charts/TimeBricks`, `../owner/charts/DelayHistogram`, `../owner/charts/SLAScoreDonut`, `../owner/charts/StaffDistribution`, `../owner/charts/StaffAvgCards`, `../owner/charts/StaffTimeline`, `../owner/lib/dataFetcher_urine.js`  
- **Imported by (1):** `src/main_owner_urine.jsx`  
- **Controls / signals:** React effects  

## `src/owner/charts/CountsBar.jsx`

- **Lines:** 44  
- **Purpose:** /* Increased height to 480 to match the Stage Timeline and fill the container */  
- **Exports:** default  
- **Imports from (2):** `react`, `recharts`  
- **Imported by (9):** `src/owner/OwnerBiochem.jsx`, `src/owner/OwnerBloodGroup.jsx`, `src/owner/OwnerCoag.jsx`, `src/owner/OwnerESRPage.jsx`, `src/owner/OwnerHaemPage.jsx`, `src/owner/OwnerHormones.jsx`, `src/owner/OwnerRapidPage.jsx`, `src/owner/OwnerSerology.jsx`, `src/owner/OwnerUrine.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/charts/CountsBarInside.jsx`

- **Lines:** 32  
- **Purpose:** // src/owner/charts/CountsBar.jsx  
- **Exports:** default  
- **Imports from (2):** `react`, `recharts`  
- **Imported by (1):** `src/owner/OwnerLabPage.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/charts/CountsBarOutsource.jsx`

- **Lines:** 37  
- **Purpose:** // src/owner/charts/CountsBar.jsx  
- **Exports:** default  
- **Imports from (2):** `react`, `recharts`  
- **Imported by (1):** `src/owner/OwnerOutsourcePage.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/charts/DelayHistogram.jsx`

- **Lines:** 39  
- **Purpose:** // Initialize buckets for excess time categories  
- **Exports:** default  
- **Imports from (2):** `react`, `recharts`  
- **Imported by (11):** `src/owner/OwnerBiochem.jsx`, `src/owner/OwnerBloodGroup.jsx`, `src/owner/OwnerCoag.jsx`, `src/owner/OwnerESRPage.jsx`, `src/owner/OwnerHaemPage.jsx`, `src/owner/OwnerHormones.jsx`, `src/owner/OwnerLabPage.jsx`, `src/owner/OwnerOutsourcePage.jsx`, `src/owner/OwnerRapidPage.jsx`, `src/owner/OwnerSerology.jsx`, `src/owner/OwnerUrine.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/charts/SLAScoreDonut.jsx`

- **Lines:** 47  
- **Purpose:** // If total is 3, and within is 3 (because 30/30 is now a pass),  
- **Exports:** default  
- **Imports from (2):** `react`, `recharts`  
- **Imported by (11):** `src/owner/OwnerBiochem.jsx`, `src/owner/OwnerBloodGroup.jsx`, `src/owner/OwnerCoag.jsx`, `src/owner/OwnerESRPage.jsx`, `src/owner/OwnerHaemPage.jsx`, `src/owner/OwnerHormones.jsx`, `src/owner/OwnerLabPage.jsx`, `src/owner/OwnerOutsourcePage.jsx`, `src/owner/OwnerRapidPage.jsx`, `src/owner/OwnerSerology.jsx`, `src/owner/OwnerUrine.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/charts/StackedStageLines.jsx`

- **Lines:** 318  
- **Purpose:** // src/owner/charts/StackedStageLines.jsx  
- **Exports:** default  
- **Imports from (2):** `react`, `recharts`  
- **Imported by (9):** `src/owner/OwnerBiochem.jsx`, `src/owner/OwnerBloodGroup.jsx`, `src/owner/OwnerCoag.jsx`, `src/owner/OwnerESRPage.jsx`, `src/owner/OwnerHaemPage.jsx`, `src/owner/OwnerHormones.jsx`, `src/owner/OwnerRapidPage.jsx`, `src/owner/OwnerSerology.jsx`, `src/owner/OwnerUrine.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/charts/StackedStageLinesInside.jsx`

- **Lines:** 66  
- **Purpose:** // src/owner/charts/StackedStageLines.jsx  
- **Exports:** default  
- **Imports from (2):** `react`, `recharts`  
- **Imported by (1):** `src/owner/OwnerLabPage.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/charts/StackedStageLinesOutsource.jsx`

- **Lines:** 293  
- **Purpose:** /** * Enhanced Duration Formatter * Converts minutes into Day/Hr/Min format based on duration. */  
- **Exports:** default  
- **Imports from (2):** `react`, `recharts`  
- **Imported by (1):** `src/owner/OwnerOutsourcePage.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/charts/StaffAvgCards.jsx`

- **Lines:** 109  
- **Purpose:** // src/owner/charts/StaffAvgCards.jsx  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (9):** `src/owner/OwnerBiochem.jsx`, `src/owner/OwnerBloodGroup.jsx`, `src/owner/OwnerCoag.jsx`, `src/owner/OwnerESRPage.jsx`, `src/owner/OwnerHaemPage.jsx`, `src/owner/OwnerHormones.jsx`, `src/owner/OwnerRapidPage.jsx`, `src/owner/OwnerSerology.jsx`, `src/owner/OwnerUrine.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/charts/StaffDistribution.jsx`

- **Lines:** 251  
- **Purpose:** // src/owner/charts/StaffDistribution.jsx  
- **Exports:** default  
- **Imports from (2):** `react`, `recharts`  
- **Imported by (11):** `src/owner/OwnerBiochem.jsx`, `src/owner/OwnerBloodGroup.jsx`, `src/owner/OwnerCoag.jsx`, `src/owner/OwnerESRPage.jsx`, `src/owner/OwnerHaemPage.jsx`, `src/owner/OwnerHormones.jsx`, `src/owner/OwnerLabPage.jsx`, `src/owner/OwnerOutsourcePage.jsx`, `src/owner/OwnerRapidPage.jsx`, `src/owner/OwnerSerology.jsx`, `src/owner/OwnerUrine.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/charts/StaffTimeline.jsx`

- **Lines:** 374  
- **Purpose:** // src/owner/charts/StaffTimeline.jsx  
- **Exports:** default  
- **Imports from (2):** `react`, `recharts`  
- **Imported by (9):** `src/owner/OwnerBiochem.jsx`, `src/owner/OwnerBloodGroup.jsx`, `src/owner/OwnerCoag.jsx`, `src/owner/OwnerESRPage.jsx`, `src/owner/OwnerHaemPage.jsx`, `src/owner/OwnerHormones.jsx`, `src/owner/OwnerRapidPage.jsx`, `src/owner/OwnerSerology.jsx`, `src/owner/OwnerUrine.jsx`  
- **Controls / signals:** React effects  

## `src/owner/charts/TimeBricks.css`

- **Lines:** 123  
- **Purpose:** /* --- CONTAINER --- */  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/charts/TimeBricks.jsx`

- **Lines:** 163  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (4):** `react`, `@fullcalendar/react`, `@fullcalendar/resource-timeline`, `moment`  
- **Imported by (10):** `src/owner/OwnerBiochem.jsx`, `src/owner/OwnerBloodGroup.jsx`, `src/owner/OwnerCoag.jsx`, `src/owner/OwnerESRPage.jsx`, `src/owner/OwnerHaemPage.jsx`, `src/owner/OwnerHormones.jsx`, `src/owner/OwnerLabPage.jsx`, `src/owner/OwnerRapidPage.jsx`, `src/owner/OwnerSerology.jsx`, `src/owner/OwnerUrine.jsx`  
- **Controls / signals:** React effects  

## `src/owner/charts/TimeBricksOutsource.css`

- **Lines:** 69  
- **Purpose:** Stylesheet for co-located UI module.  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/charts/TimeBricksOutsource.jsx`

- **Lines:** 197  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (5):** `react`, `@fullcalendar/react`, `@fullcalendar/resource-timeline`, `@fullcalendar/interaction`, `moment`  
- **Imported by (1):** `src/owner/OwnerOutsourcePage.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/components/DateSourceFilter.jsx`

- **Lines:** 60  
- **Purpose:** /* ---- DATE FROM ---- */  
- **Exports:** default  
- **Imports from (2):** `react`, `../OwnerContext.jsx`  
- **Imported by (12):** `src/owner/OwnerApp.jsx`, `src/owner/OwnerBiochem.jsx`, `src/owner/OwnerBloodGroup.jsx`, `src/owner/OwnerCoag.jsx`, `src/owner/OwnerESRPage.jsx`, `src/owner/OwnerHaemPage.jsx`, `src/owner/OwnerHormones.jsx`, `src/owner/OwnerLabPage.jsx`, `src/owner/OwnerOutsourcePage.jsx`, `src/owner/OwnerRapidPage.jsx`, `src/owner/OwnerSerology.jsx`, `src/owner/OwnerUrine.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/components/DelayTable.jsx`

- **Lines:** 76  
- **Purpose:** /* Increased width for Reg No */  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (11):** `src/owner/OwnerBiochem.jsx`, `src/owner/OwnerBloodGroup.jsx`, `src/owner/OwnerCoag.jsx`, `src/owner/OwnerESRPage.jsx`, `src/owner/OwnerHaemPage.jsx`, `src/owner/OwnerHormones.jsx`, `src/owner/OwnerLabPage.jsx`, `src/owner/OwnerOutsourcePage.jsx`, `src/owner/OwnerRapidPage.jsx`, `src/owner/OwnerSerology.jsx`, `src/owner/OwnerUrine.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/components/KPIBlocks.jsx`

- **Lines:** 124  
- **Purpose:** /* PATIENT METRICS */  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (8):** `src/owner/OwnerBiochem.jsx`, `src/owner/OwnerCoag.jsx`, `src/owner/OwnerESRPage.jsx`, `src/owner/OwnerHaemPage.jsx`, `src/owner/OwnerHormones.jsx`, `src/owner/OwnerRapidPage.jsx`, `src/owner/OwnerSerology.jsx`, `src/owner/OwnerUrine.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/components/KPIBlocksInside.jsx`

- **Lines:** 73  
- **Purpose:** /* PATIENT METRICS */  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (1):** `src/owner/OwnerLabPage.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/components/KPIBlocksOutsource.jsx`

- **Lines:** 100  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (1):** `src/owner/OwnerOutsourcePage.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/components/KPIBlocks_BloodGroup.jsx`

- **Lines:** 116  
- **Purpose:** /* PATIENT METRICS */  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (1):** `src/owner/OwnerBloodGroup.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/components/PatientListModal.jsx`

- **Lines:** 74  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (9):** `src/owner/OwnerBiochem.jsx`, `src/owner/OwnerBloodGroup.jsx`, `src/owner/OwnerCoag.jsx`, `src/owner/OwnerESRPage.jsx`, `src/owner/OwnerHaemPage.jsx`, `src/owner/OwnerHormones.jsx`, `src/owner/OwnerRapidPage.jsx`, `src/owner/OwnerSerology.jsx`, `src/owner/OwnerUrine.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/components/PatientListModalInside.jsx`

- **Lines:** 56  
- **Purpose:** /* Validated Header Removed */  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (1):** `src/owner/OwnerLabPage.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/components/PatientListModalOutsource.jsx`

- **Lines:** 86  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (1):** `src/owner/OwnerOutsourcePage.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/data/test_timings.json`

- **Lines:** 53  
- **Purpose:** Static configuration / routing / reference data.  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (14):** `src/owner/OwnerLabPage.jsx`, `src/owner/OwnerOutsourcePage.jsx`, `src/owner/lib/dataFetcher.js`, `src/owner/lib/dataFetcher_biochem_main.js`, `src/owner/lib/dataFetcher_bloodgroup_retesting.js`, `src/owner/lib/dataFetcher_bloodgroup_testing.js`, `src/owner/lib/dataFetcher_esr.js`, `src/owner/lib/dataFetcher_haem.js`, `src/owner/lib/dataFetcher_hormones_main.js`, `src/owner/lib/dataFetcher_lab.js`, `src/owner/lib/dataFetcher_outsource.js`, `src/owner/lib/dataFetcher_rapid.js`, `src/owner/lib/dataFetcher_serology.js`, `src/owner/lib/dataFetcher_urine.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/lib/dataFetcher.js`

- **Lines:** 772  
- **Purpose:** /* ====================== DATE UTILS ====================== */  
- **Exports:** computeKPIs, computeSLAViolations, computeStaffAnalytics, extractCoagTestCount, fetchTestTimings, isCoagTest, mergeDeptRows, minutesDiff, normalizeTestsField, subscribeOverview, toDate, unifyForCharts  
- **Imports from (8):** `../../firebaseConfig.js`, `../../shared/firestore/scopedTimePrintedQuery.js`, `../../shared/cache/createOwnerSessionPaint.js`, `../../shared/firestore/trackedFirestore.js`, `./withOwnerSourceControl.js`, `../data/test_timings.json`, `../../shared/utils/dates.js`, `../../shared/utils/normalizeTestsField.js`  
- **Imported by (1):** `src/owner/OwnerCoag.jsx`  
- **Controls / signals:** Firestore listeners  

## `src/owner/lib/dataFetcher_biochem_main.js`

- **Lines:** 580  
- **Purpose:** /* ====================== DATE UTILS ====================== */  
- **Exports:** computeKPIs, computeSLAViolations, computeStaffAnalytics, extractBiochemMainTestCount, fetchTestTimings, isBiochemMainTest, mergeDeptRows, minutesDiff, normalizeTestsField, subscribeOverview, toDate, unifyForCharts  
- **Imports from (9):** `../../firebaseConfig.js`, `../../shared/firestore/scopedTimePrintedQuery.js`, `../../shared/cache/createOwnerSessionPaint.js`, `../../shared/firestore/trackedFirestore.js`, `./withOwnerSourceControl.js`, `../data/test_timings.json`, `../../biochem_testRouting.json`, `../../shared/utils/dates.js`, `../../shared/utils/normalizeTestsField.js`  
- **Imported by (1):** `src/owner/OwnerBiochem.jsx`  
- **Controls / signals:** Firestore listeners  

## `src/owner/lib/dataFetcher_bloodgroup_retesting.js`

- **Lines:** 501  
- **Purpose:** /* ====================== DATE UTILS ====================== */  
- **Exports:** computeKPIs, computeSLAViolations, computeStaffAnalytics, extractBloodGroupTestCount, fetchTestTimings, isBloodGroupTest, mergeDeptRows, minutesDiff, normalizeTestsField, subscribeOverview, toDate, unifyForCharts  
- **Imports from (8):** `../../firebaseConfig.js`, `../../shared/firestore/scopedTimePrintedQuery.js`, `../../shared/cache/createOwnerSessionPaint.js`, `../../shared/firestore/trackedFirestore.js`, `./withOwnerSourceControl.js`, `../data/test_timings.json`, `../../shared/utils/dates.js`, `../../shared/utils/normalizeTestsField.js`  
- **Imported by (1):** `src/owner/OwnerBloodGroup.jsx`  
- **Controls / signals:** Firestore listeners  

## `src/owner/lib/dataFetcher_bloodgroup_testing.js`

- **Lines:** 594  
- **Purpose:** /* ====================== DATE UTILS ====================== */  
- **Exports:** computeKPIs, computeSLAViolations, computeStaffAnalytics, extractBloodGroupTestCount, fetchTestTimings, isBloodGroupTest, mergeDeptRows, minutesDiff, normalizeTestsField, subscribeOverview, toDate, unifyForCharts  
- **Imports from (8):** `../../firebaseConfig.js`, `../../shared/firestore/scopedTimePrintedQuery.js`, `../../shared/cache/createOwnerSessionPaint.js`, `../../shared/firestore/trackedFirestore.js`, `./withOwnerSourceControl.js`, `../data/test_timings.json`, `../../shared/utils/dates.js`, `../../shared/utils/normalizeTestsField.js`  
- **Imported by (1):** `src/owner/OwnerBloodGroup.jsx`  
- **Controls / signals:** Firestore listeners  

## `src/owner/lib/dataFetcher_esr.js`

- **Lines:** 760  
- **Purpose:** /* ====================== DATE UTILS ====================== */  
- **Exports:** computeKPIs, computeSLAViolations, computeStaffAnalytics, extractESRTestCount, fetchTestTimings, isESRTest, mergeDeptRows, minutesDiff, normalizeTestsField, subscribeOverview, toDate, unifyForCharts  
- **Imports from (8):** `../../firebaseConfig.js`, `../../shared/firestore/scopedTimePrintedQuery.js`, `../../shared/cache/createOwnerSessionPaint.js`, `../../shared/firestore/trackedFirestore.js`, `./withOwnerSourceControl.js`, `../data/test_timings.json`, `../../shared/utils/dates.js`, `../../shared/utils/normalizeTestsField.js`  
- **Imported by (1):** `src/owner/OwnerESRPage.jsx`  
- **Controls / signals:** Firestore listeners  

## `src/owner/lib/dataFetcher_haem.js`

- **Lines:** 696  
- **Purpose:** /* ====================== DATE UTILS ====================== */  
- **Exports:** computeKPIs, computeSLAViolations, computeStaffAnalytics, extractHaemTestCount, fetchTestTimings, isHaemTest, mergeDeptRows, minutesDiff, normalizeTestsField, subscribeOverview, toDate, unifyForCharts  
- **Imports from (8):** `../../firebaseConfig.js`, `../../shared/firestore/scopedTimePrintedQuery.js`, `../../shared/cache/createOwnerSessionPaint.js`, `../../shared/firestore/trackedFirestore.js`, `./withOwnerSourceControl.js`, `../data/test_timings.json`, `../../shared/utils/dates.js`, `../../shared/utils/normalizeTestsField.js`  
- **Imported by (1):** `src/owner/OwnerHaemPage.jsx`  
- **Controls / signals:** Firestore listeners  

## `src/owner/lib/dataFetcher_hormones_main.js`

- **Lines:** 563  
- **Purpose:** /* ====================== DATE UTILS ====================== */  
- **Exports:** computeKPIs, computeSLAViolations, computeStaffAnalytics, extractHormonesMainTestCount, fetchTestTimings, isHormonesMainTest, mergeDeptRows, minutesDiff, normalizeTestsField, subscribeOverview, toDate, unifyForCharts  
- **Imports from (8):** `../../firebaseConfig.js`, `../../shared/firestore/scopedTimePrintedQuery.js`, `../../shared/cache/createOwnerSessionPaint.js`, `../../shared/firestore/trackedFirestore.js`, `./withOwnerSourceControl.js`, `../data/test_timings.json`, `../../shared/utils/dates.js`, `../../shared/utils/normalizeTestsField.js`  
- **Imported by (1):** `src/owner/OwnerHormones.jsx`  
- **Controls / signals:** Firestore listeners  

## `src/owner/lib/dataFetcher_lab.js`

- **Lines:** 293  
- **Purpose:** /* ====================== DATE UTILS ====================== */  
- **Exports:** computeKPIs, mergeDeptRows, minutesDiff, normalizeTestsField, subscribeOverview, toDate  
- **Imports from (9):** `../../firebaseConfig.js`, `../../shared/firestore/scopedTimePrintedQuery.js`, `../../shared/cache/createOwnerSessionPaint.js`, `../../shared/firestore/trackedFirestore.js`, `./withOwnerSourceControl.js`, `../data/test_timings.json`, `../../inside_room_routing.json`, `../../shared/utils/dates.js`, `../../shared/utils/normalizeTestsFieldUpper.js`  
- **Imported by (1):** `src/owner/OwnerLabPage.jsx`  
- **Controls / signals:** Firestore listeners  

## `src/owner/lib/dataFetcher_outsource.js`

- **Lines:** 518  
- **Purpose:** /* ====================== DATE UTILS ====================== */  
- **Exports:** computeKPIs, formatTAT, mergeOutsourceRows, minutesDiff, normalizeTestsField, subscribeOverview, toDate  
- **Imports from (9):** `../../firebaseConfig.js`, `../../shared/firestore/scopedTimePrintedQuery.js`, `../../shared/cache/createOwnerSessionPaint.js`, `../../shared/firestore/trackedFirestore.js`, `./withOwnerSourceControl.js`, `../data/test_timings.json`, `../../Outsource.json`, `../../shared/utils/dates.js`, `../../shared/utils/normalizeTestsFieldUpper.js`  
- **Imported by (1):** `src/owner/OwnerOutsourcePage.jsx`  
- **Controls / signals:** Firestore listeners  

## `src/owner/lib/dataFetcher_rapid.js`

- **Lines:** 793  
- **Purpose:** /* ====================== DATE UTILS ====================== */  
- **Exports:** computeKPIs, computeSLAViolations, computeStaffAnalytics, extractRapidTestCount, fetchTestTimings, isRapidTest, mergeDeptRows, minutesDiff, normalizeTestsField, subscribeOverview, toDate, unifyForCharts  
- **Imports from (9):** `../../firebaseConfig.js`, `../../shared/firestore/scopedTimePrintedQuery.js`, `../../shared/cache/createOwnerSessionPaint.js`, `../../shared/firestore/trackedFirestore.js`, `./withOwnerSourceControl.js`, `../data/test_timings.json`, `../../backroom_routing.json`, `../../shared/utils/dates.js`, `../../shared/utils/normalizeTestsField.js`  
- **Imported by (1):** `src/owner/OwnerRapidPage.jsx`  
- **Controls / signals:** Firestore listeners  

## `src/owner/lib/dataFetcher_serology.js`

- **Lines:** 784  
- **Purpose:** /* ====================== DATE UTILS ====================== */  
- **Exports:** computeKPIs, computeSLAViolations, computeStaffAnalytics, extractSerologyTestCount, fetchTestTimings, isSerologyTest, mergeDeptRows, minutesDiff, normalizeTestsField, subscribeOverview, toDate, unifyForCharts  
- **Imports from (9):** `../../firebaseConfig.js`, `../../shared/firestore/scopedTimePrintedQuery.js`, `../../shared/cache/createOwnerSessionPaint.js`, `../../shared/firestore/trackedFirestore.js`, `./withOwnerSourceControl.js`, `../../backroom_routing.json`, `../data/test_timings.json`, `../../shared/utils/dates.js`, `../../shared/utils/normalizeTestsField.js`  
- **Imported by (1):** `src/owner/OwnerSerology.jsx`  
- **Controls / signals:** Firestore listeners  

## `src/owner/lib/dataFetcher_urine.js`

- **Lines:** 606  
- **Purpose:** /* ====================== DATE UTILS ====================== */  
- **Exports:** computeKPIs, computeSLAViolations, computeStaffAnalytics, extractUrineTestCount, fetchTestTimings, isUrineTest, mergeDeptRows, minutesDiff, normalizeTestsField, subscribeOverview, toDate, unifyForCharts  
- **Imports from (8):** `../../firebaseConfig.js`, `../../shared/firestore/scopedTimePrintedQuery.js`, `../../shared/cache/createOwnerSessionPaint.js`, `../../shared/firestore/trackedFirestore.js`, `./withOwnerSourceControl.js`, `../data/test_timings.json`, `../../shared/utils/dates.js`, `../../shared/utils/normalizeTestsField.js`  
- **Imported by (1):** `src/owner/OwnerUrine.jsx`  
- **Controls / signals:** Firestore listeners  

## `src/owner/lib/withOwnerSourceControl.js`

- **Lines:** 25  
- **Purpose:** /** * Attach updateSource to an Owner subscribeOverview unsubscribe fn. * Lets pages change client-side source filter without tearing down listeners. */  
- **Exports:** withOwnerSourceControl  
- **Imports from (0):**   
- **Imported by (13):** `src/owner/lib/dataFetcher.js`, `src/owner/lib/dataFetcher_biochem_main.js`, `src/owner/lib/dataFetcher_bloodgroup_retesting.js`, `src/owner/lib/dataFetcher_bloodgroup_testing.js`, `src/owner/lib/dataFetcher_esr.js`, `src/owner/lib/dataFetcher_haem.js`, `src/owner/lib/dataFetcher_hormones_main.js`, `src/owner/lib/dataFetcher_lab.js`, `src/owner/lib/dataFetcher_outsource.js`, `src/owner/lib/dataFetcher_rapid.js`, `src/owner/lib/dataFetcher_serology.js`, `src/owner/lib/dataFetcher_urine.js`, `src/owner/workflow/workflowfetcher.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/workflow/WorkflowKPIBlocks.jsx`

- **Lines:** 131  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (1):** `src/owner/OwnerApp.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/workflow/WorkflowStackedBars.jsx`

- **Lines:** 404  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (3):** `react`, `recharts`, `./workflowfetcher`  
- **Imported by (1):** `src/owner/OwnerApp.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/workflow/WorkflowStaffDistribution.jsx`

- **Lines:** 280  
- **Purpose:** // src/owner/charts/StaffDistribution.jsx  
- **Exports:** default  
- **Imports from (2):** `react`, `recharts`  
- **Imported by (1):** `src/owner/OwnerApp.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/owner/workflow/workflowfetcher.js`

- **Lines:** 753  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** ROUTINE_WORKFLOW_CHART_KEYS, ROUTINE_WORKFLOW_COLORS, ROUTINE_WORKFLOW_LABELS, ROUTINE_WORKFLOW_LOOKUP, SPECIAL_WORKFLOW_LOOKUP, buildWorkflowSummary, mergeWorkflowRecords, subscribeToWorkflowAnalytics  
- **Imports from (5):** `../../shared/firestore/trackedFirestore.js`, `../../shared/firestore/scopedTimePrintedQuery.js`, `../../shared/cache/createOwnerSessionPaint.js`, `../lib/withOwnerSourceControl.js`, `../../test_mapping.json`  
- **Imported by (2):** `src/owner/OwnerApp.jsx`, `src/owner/workflow/WorkflowStackedBars.jsx`  
- **Controls / signals:** Firestore listeners  

## `src/performance/Performance.css`

- **Lines:** 326  
- **Purpose:** Stylesheet for co-located UI module.  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/performance/PerformanceContext.jsx`

- **Lines:** 318  
- **Purpose:** /** * Dashboard-only React context — polls performance store. * Date filter merges: live session + localStorage rollups + Firestore perf_daily. */  
- **Exports:** PerformanceProvider, usePerf  
- **Imports from (8):** `react`, `./performanceStore.js`, `./healthScorer.js`, `./cacheMetrics.js`, `./networkMetrics.js`, `./renderMetrics.js`, `./rollupMerge.js`, `./perfDailyFirestore.js`  
- **Imported by (1):** `src/performance/PerformanceDashboard.jsx`  
- **Controls / signals:** React effects  

## `src/performance/PerformanceDashboard.jsx`

- **Lines:** 903  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** default  
- **Imports from (3):** `react`, `./PerformanceContext.jsx`, `./pageLoadBands.js`  
- **Imported by (1):** `src/main_performance.jsx`  
- **Controls / signals:** React effects  

## `src/performance/bootstrap.js`

- **Lines:** 209  
- **Purpose:** /** * Passive performance bootstrap — imported from firebaseConfig. * No-ops when mango.perf.monitor === "0". */  
- **Exports:** startPerformanceMonitoring  
- **Imports from (5):** `./performanceStore.js`, `./performanceCollector.js`, `./firestoreMetrics.js`, `./renderMetrics.js`, `./healthScorer.js`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/performance/cacheMetrics.js`

- **Lines:** 57  
- **Purpose:** /** * Cache effectiveness aggregations from recorded cache events. */  
- **Exports:** summarizeCache  
- **Imports from (0):**   
- **Imported by (5):** `src/performance/PerformanceContext.jsx`, `src/performance/exportPerformancePdf.js`, `src/performance/healthScorer.js`, `src/performance/perfDailyFirestore.js`, `src/performance/rollupMerge.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/performance/exportPerformancePdf.js`

- **Lines:** 747  
- **Purpose:** /** * End-of-day Performance PDF — full multi-page report of all dashboard tabs. * Downloads via jsPDF.save() to the browser Downloads folder. */  
- **Exports:** downloadPerformancePdf  
- **Imports from (10):** `jspdf`, `jspdf-autotable`, `./performanceStore.js`, `./healthScorer.js`, `./cacheMetrics.js`, `./networkMetrics.js`, `./renderMetrics.js`, `./rollupMerge.js`, `./perfDailyFirestore.js`, `./pageLoadBands.js`  
- **Imported by (0):** —  
- **Controls / signals:** module definitions / UI / config  

## `src/performance/firestoreMetrics.js`

- **Lines:** 131  
- **Purpose:** /** * Classify Firestore collections into read buckets + page identity helpers. */  
- **Exports:** classifyCollection, departmentForCollection, extractCollectionName, resolvePageIdentity  
- **Imports from (0):**   
- **Imported by (3):** `src/performance/bootstrap.js`, `src/performance/performanceCollector.js`, `src/shared/firestore/trackedFirestore.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/performance/healthScorer.js`

- **Lines:** 407  
- **Purpose:** /** * Daily engineering health scores + alert rules. */  
- **Exports:** band, buildDepartmentRankings, buildQueryLeaderboard, computeAlerts, computeHealthScores, countDuplicateListeners, getHealthHistory, persistTodayHealth  
- **Imports from (6):** `./performanceStore.js`, `./cacheMetrics.js`, `./networkMetrics.js`, `./performanceStore.js`, `./rollupMerge.js`, `./pageLoadBands.js`  
- **Imported by (3):** `src/performance/PerformanceContext.jsx`, `src/performance/bootstrap.js`, `src/performance/exportPerformancePdf.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/performance/networkMetrics.js`

- **Lines:** 85  
- **Purpose:** /** Network / query duration aggregates from measured samples. */  
- **Exports:** dayEndExclusiveMs, dayStartMs, filterByDateRange, filterSince, percentile, sinceMs, startOfTodayMs, summarizeDurations, toDateKey, todayKey  
- **Imports from (0):**   
- **Imported by (5):** `src/performance/PerformanceContext.jsx`, `src/performance/exportPerformancePdf.js`, `src/performance/healthScorer.js`, `src/performance/perfDailyFirestore.js`, `src/performance/rollupMerge.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/performance/pageLoadBands.js`

- **Lines:** 39  
- **Purpose:** /** * Page load performance bands (totalMs). * Green < 2s * Yellow 2s – 30s * Orange 30s – 1 min * Red 1 min+ (includes 1–2 min and slower) */  
- **Exports:** PAGE_LOAD_BAND_LEGEND, PAGE_LOAD_GREEN_MS, PAGE_LOAD_ORANGE_MS, PAGE_LOAD_RED_MS, PAGE_LOAD_SLOW_MS, PAGE_LOAD_YELLOW_MS, loadBand, loadBandLabel  
- **Imports from (0):**   
- **Imported by (6):** `src/performance/PerformanceDashboard.jsx`, `src/performance/exportPerformancePdf.js`, `src/performance/healthScorer.js`, `src/performance/perfDailyFirestore.js`, `src/performance/performanceCollector.js`, `src/performance/rollupMerge.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/performance/perfDailyFirestore.js`

- **Lines:** 291  
- **Purpose:** /** * Firestore persistence for Performance daily rollups. * Collection: perf_daily * Doc id: `${YYYY-MM-DD}__${clientId}` * * Uses dynamic import of firebase only from callers that already have db — * this module import  
- **Exports:** buildSessionDayRollup, combineLocalAndRemoteRollups, fetchPerfDailyRange, flushPerfDaily, getPerfClientId, mergeUniqueByAt, schedulePerfDailyFlush  
- **Imports from (8):** `firebase/firestore`, `../firebaseConfig.js`, `../shared/config/collections.js`, `./performanceStore.js`, `./cacheMetrics.js`, `./networkMetrics.js`, `./rollupMerge.js`, `./pageLoadBands.js`  
- **Imported by (2):** `src/performance/PerformanceContext.jsx`, `src/performance/exportPerformancePdf.js`  
- **Controls / signals:** Firestore get reads  

## `src/performance/performanceCollector.js`

- **Lines:** 307  
- **Purpose:** /** * Public recording API for passive instrumentation. */  
- **Exports:** closeListener, finalizePageLoad, getPageContext, markCacheHitOnLoad, markPageLoadStart, onFirstSnapshot, recordCacheEvent, recordEvent, recordIncrementalSync, recordOwnerPaint, recordOwnerRefresh, recordQuery, recordRead, setPageContext, upsertListener  
- **Imports from (4):** `./performanceStore.js`, `./firestoreMetrics.js`, `./renderMetrics.js`, `./pageLoadBands.js`  
- **Imported by (2):** `src/performance/bootstrap.js`, `src/shared/firestore/trackedFirestore.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/performance/performanceStore.js`

- **Lines:** 391  
- **Purpose:** /** * In-memory + sessionStorage performance store. * Detailed telemetry → sessionStorage (mango.perf.v1) * Daily health aggregates → localStorage (mango.perf.health.v1) for 30-day trends */  
- **Exports:** addCountedReads, clearMetrics, estimateCachePayloadBytes, estimatePerfStoreBytes, estimateSessionStorageBytes, exportMetricsJson, flushCountedReads, flushPersist, getCountedReads, getCountedReadsInRange, getDailyRollups, getDailyRollupsInRange, getHealthHistory, getState, isMonitorEnabled, loadPersisted, mutate, recordToRing, saveDailyHealth, saveDailyRollup, setMonitorEnabled, subscribeStore  
- **Imports from (1):** `./rollupMerge.js`  
- **Imported by (8):** `src/performance/PerformanceContext.jsx`, `src/performance/bootstrap.js`, `src/performance/exportPerformancePdf.js`, `src/performance/healthScorer.js`, `src/performance/perfDailyFirestore.js`, `src/performance/performanceCollector.js`, `src/performance/renderMetrics.js`, `src/shared/firestore/trackedFirestore.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/performance/renderMetrics.js`

- **Lines:** 63  
- **Purpose:** /** * Lightweight render / long-task monitoring only. * Do NOT wrap every React render on lab UIs. */  
- **Exports:** getHeapEstimate, startLongTaskObserver, stopLongTaskObserver  
- **Imports from (1):** `./performanceStore.js`  
- **Imported by (4):** `src/performance/PerformanceContext.jsx`, `src/performance/bootstrap.js`, `src/performance/exportPerformancePdf.js`, `src/performance/performanceCollector.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/performance/rollupMerge.js`

- **Lines:** 138  
- **Purpose:** /** * Merge helpers for session + local + Firestore daily rollups. */  
- **Exports:** ROLLUP_CAPS, flattenRollupSamples, mergeRollupRecords, mergeUniqueByAt, sampleKey  
- **Imports from (3):** `./cacheMetrics.js`, `./networkMetrics.js`, `./pageLoadBands.js`  
- **Imported by (5):** `src/performance/PerformanceContext.jsx`, `src/performance/exportPerformancePdf.js`, `src/performance/healthScorer.js`, `src/performance/perfDailyFirestore.js`, `src/performance/performanceStore.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/shared/cache/createOwnerSessionPaint.js`

- **Lines:** 66  
- **Purpose:** /** * Behaviour-preserving session paint for read-heavy subscribeOverview streams. * Paints cache immediately (if any), then live snapshot replaces UI + cache. */  
- **Exports:** createOwnerSessionPaint  
- **Imports from (1):** `./sessionQueryCache.js`  
- **Imported by (13):** `src/owner/lib/dataFetcher.js`, `src/owner/lib/dataFetcher_biochem_main.js`, `src/owner/lib/dataFetcher_bloodgroup_retesting.js`, `src/owner/lib/dataFetcher_bloodgroup_testing.js`, `src/owner/lib/dataFetcher_esr.js`, `src/owner/lib/dataFetcher_haem.js`, `src/owner/lib/dataFetcher_hormones_main.js`, `src/owner/lib/dataFetcher_lab.js`, `src/owner/lib/dataFetcher_outsource.js`, `src/owner/lib/dataFetcher_rapid.js`, `src/owner/lib/dataFetcher_serology.js`, `src/owner/lib/dataFetcher_urine.js`, `src/owner/workflow/workflowfetcher.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/shared/cache/sessionQueryCache.js`

- **Lines:** 180  
- **Purpose:** /** * Session query cache — sessionStorage + TTL. * Isolated helper; no business logic. */  
- **Exports:** SESSION_QUERY_TTL_MS, clearExpired, getCache, ownerCacheKey, removeCache, setCache  
- **Imports from (0):**   
- **Imported by (4):** `src/analytics/LabAnalytics.jsx`, `src/inventory-command-center/InventoryCommandCenter.jsx`, `src/shared/cache/createOwnerSessionPaint.js`, `src/shared/cache/staticConfigCache.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/shared/cache/staticConfigCache.js`

- **Lines:** 30  
- **Purpose:** /** * Once-per-session static config cache (Firestore config docs only). * Uses sessionQueryCache; no business logic. */  
- **Exports:** STATIC_CONFIG_TTL_MS, getStaticConfig, removeStaticConfig, setStaticConfig  
- **Imports from (1):** `./sessionQueryCache.js`  
- **Imported by (2):** `src/inventory/InventoryAdjustmentTab.jsx`, `src/inventory/inventorymapping.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/shared/components/CriticalAlertModal.jsx`

- **Lines:** 94  
- **Purpose:** /** * Shared critical-alert capture modal. * Presentational only — callers own open state, inputs, and save handler. * Supports editable input (analyzer depts) and read-only textarea (backroom). */  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (8):** `src/backroom/ESRRegister.jsx`, `src/backroom/RapidCardRegister.jsx`, `src/backroom/SerologyRegister.jsx`, `src/backroom/UrineAnalysisRegister.jsx`, `src/biochem_main/BiochemistryMain.jsx`, `src/biochem_main/HormonesMain.jsx`, `src/coagulation/CoagulationMain.jsx`, `src/haem/Haematology.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/shared/components/RegisterFilterBar.jsx`

- **Lines:** 69  
- **Purpose:** /** * Shared register filter bar UI. * Optional class overrides preserve Inside Lab markup differences. */  
- **Exports:** default  
- **Imports from (1):** `react`  
- **Imported by (10):** `src/backroom/BloodGroupRegister.jsx`, `src/backroom/ESRRegister.jsx`, `src/backroom/RapidCardRegister.jsx`, `src/backroom/SerologyRegister.jsx`, `src/backroom/UrineAnalysisRegister.jsx`, `src/biochem_main/BiochemistryMain.jsx`, `src/biochem_main/HormonesMain.jsx`, `src/coagulation/CoagulationMain.jsx`, `src/haem/Haematology.jsx`, `src/inside_lab/InsideLab.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/shared/config/collections.js`

- **Lines:** 77  
- **Purpose:** /** * Shared Firestore collection / department maps. * Collection names and field keys must stay identical to production data. */  
- **Exports:** COMPLETION_FIELDS, MASTER_ADMIN_DEPARTMENTS, PERF_DAILY_COLLECTION, ROUTINE_DEPARTMENTS, VALIDATOR_COLLECTIONS, VALIDATOR_DATE_FIELDS  
- **Imports from (0):**   
- **Imported by (4):** `src/ValidatorUI/ValidatorDashboard.jsx`, `src/master_admin/MasterAdmin.jsx`, `src/master_admin/MasterAdmin1.jsx`, `src/performance/perfDailyFirestore.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/shared/firestore/incrementalDocStore.js`

- **Lines:** 146  
- **Purpose:** /** * Incremental Firestore snapshot processing via docChanges(). * Map<documentId, value> is the in-memory source; arrays derived on change only. * Firestore remains authoritative — this never writes and never replaces   
- **Exports:** compareByTimePrinted, createIncrementalDocStore  
- **Imports from (0):**   
- **Imported by (4):** `src/shared/firestore/subscribeInventoryByMachines.js`, `src/shared/hooks/useMasterDeptSnapshots.js`, `src/shared/hooks/useMasterRegisterSnapshots.js`, `src/shared/hooks/useScopedMasterEntries.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/shared/firestore/scopedTimePrintedQuery.js`

- **Lines:** 29  
- **Purpose:** /** * Scoped listen query: timePrinted in local calendar [from, to] (inclusive days). * dateRange: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" } * Returns null if bounds are missing/invalid. */  
- **Exports:** scopedTimePrintedQuery  
- **Imports from (3):** `firebase/firestore`, `../../firebaseConfig.js`, `../utils/dates.js`  
- **Imported by (13):** `src/owner/lib/dataFetcher.js`, `src/owner/lib/dataFetcher_biochem_main.js`, `src/owner/lib/dataFetcher_bloodgroup_retesting.js`, `src/owner/lib/dataFetcher_bloodgroup_testing.js`, `src/owner/lib/dataFetcher_esr.js`, `src/owner/lib/dataFetcher_haem.js`, `src/owner/lib/dataFetcher_hormones_main.js`, `src/owner/lib/dataFetcher_lab.js`, `src/owner/lib/dataFetcher_outsource.js`, `src/owner/lib/dataFetcher_rapid.js`, `src/owner/lib/dataFetcher_serology.js`, `src/owner/lib/dataFetcher_urine.js`, `src/owner/workflow/workflowfetcher.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/shared/firestore/scopedTimestampRangeQuery.js`

- **Lines:** 38  
- **Purpose:** /** * Scoped listen: Timestamp field in IST calendar [from, to] (inclusive days). * dateRange: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" } */  
- **Exports:** scopedTimestampRangeQuery  
- **Imports from (3):** `firebase/firestore`, `../../firebaseConfig.js`, `../utils/dates.js`  
- **Imported by (2):** `src/analytics/LabAnalytics.jsx`, `src/inventory-command-center/InventoryCommandCenter.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/shared/firestore/subscribeInventoryByMachines.js`

- **Lines:** 106  
- **Purpose:** /** Live stock statuses used by inventory tabs (excludes Consumed history). */  
- **Exports:** INVENTORY_LIVE_STATUSES, INVENTORY_MACHINES, subscribeInventoryByMachines  
- **Imports from (4):** `firebase/firestore`, `./trackedFirestore.js`, `./incrementalDocStore.js`, `../../firebaseConfig.js`  
- **Imported by (7):** `src/haem/Haematology.jsx`, `src/inventory-command-center/InventoryCommandCenter.jsx`, `src/inventory/BackroomInventoryTab.jsx`, `src/inventory/BackupInventoryTab.jsx`, `src/inventory/CoagulationInventoryTab.jsx`, `src/inventory/DeptInventoryTab.jsx`, `src/inventory/HaemInventoryTab.jsx`  
- **Controls / signals:** Firestore listeners  

## `src/shared/firestore/trackedFirestore.js`

- **Lines:** 195  
- **Purpose:** /** * Behaviour-identical Firestore wrappers for passive metrics. * Same signatures as firebase/firestore onSnapshot / getDocs / getDoc. */  
- **Exports:** trackedGetDoc, trackedGetDocs, trackedOnSnapshot  
- **Imports from (4):** `firebase/firestore`, `../../performance/performanceStore.js`, `../../performance/performanceCollector.js`, `../../performance/firestoreMetrics.js`  
- **Imported by (34):** `src/ValidatorUI/ValidatorDashboard.jsx`, `src/analytics/LabAnalytics.jsx`, `src/backroom/BloodGroupRegister.jsx`, `src/backup/BackupEntry.jsx`, `src/critical/CriticalAlertDashboard.jsx`, `src/inside_lab/InsideLab.jsx`, `src/inventory-command-center/InventoryCommandCenter.jsx`, `src/inventory/InventoryAdjustmentTab.jsx`, `src/inventory/InventoryIntake.jsx`, `src/inventory/inventorymapping.js`, `src/mango.jsx`, `src/mango1.jsx`, `src/master/MasterView_Table1.jsx`, `src/master_admin/MasterAdmin.jsx`, `src/master_admin/MasterAdmin1.jsx` …  
- **Controls / signals:** Firestore listeners, Firestore get reads  

## `src/shared/hooks/useMasterDeptSnapshots.js`

- **Lines:** 297  
- **Purpose:** /** * Shared master + department + critical_alerts subscriptions. * * Snapshot processing is incremental (docChanges) after the first seed. * Firestore remains the only source of truth. */  
- **Exports:** useMasterDeptSnapshots  
- **Imports from (7):** `react`, `firebase/firestore`, `../firestore/trackedFirestore.js`, `../firestore/incrementalDocStore.js`, `../../firebaseConfig.js`, `../utils/ids.js`, `../utils/dates.js`  
- **Imported by (8):** `src/backroom/ESRRegister.jsx`, `src/backroom/RapidCardRegister.jsx`, `src/backroom/SerologyRegister.jsx`, `src/backroom/UrineAnalysisRegister.jsx`, `src/biochem_main/BiochemistryMain.jsx`, `src/biochem_main/HormonesMain.jsx`, `src/coagulation/CoagulationMain.jsx`, `src/haem/Haematology.jsx`  
- **Controls / signals:** Firestore listeners, React effects  

## `src/shared/hooks/useMasterRegisterSnapshots.js`

- **Lines:** 114  
- **Purpose:** Application module (see exports and importers).  
- **Exports:** useMasterRegisterSnapshots  
- **Imports from (6):** `react`, `firebase/firestore`, `../firestore/trackedFirestore.js`, `../firestore/incrementalDocStore.js`, `../../firebaseConfig.js`, `../utils/dates.js`  
- **Imported by (1):** `src/master/MasterView_Table.jsx`  
- **Controls / signals:** Firestore listeners, React effects  

## `src/shared/hooks/usePersistedObjectState.js`

- **Lines:** 34  
- **Purpose:** /** * Object state persisted to localStorage under an exact key. * Keys must stay identical to existing department draft keys. */  
- **Exports:** usePersistedObjectState  
- **Imports from (1):** `react`  
- **Imported by (10):** `src/backroom/BloodGroupRegister.jsx`, `src/backroom/ESRRegister.jsx`, `src/backroom/RapidCardRegister.jsx`, `src/backroom/SerologyRegister.jsx`, `src/backroom/UrineAnalysisRegister.jsx`, `src/biochem_main/BiochemistryMain.jsx`, `src/biochem_main/HormonesMain.jsx`, `src/coagulation/CoagulationMain.jsx`, `src/haem/Haematology.jsx`, `src/outsource/Outsource.jsx`  
- **Controls / signals:** React effects  

## `src/shared/hooks/useRegisterFilters.js`

- **Lines:** 27  
- **Purpose:** /** * Shared register filter state. * Preserves existing defaults: empty search, source "All", today for date range. * Dates initialize synchronously so master_register queries can scope on first paint. */  
- **Exports:** useRegisterFilters  
- **Imports from (2):** `react`, `../utils/dates.js`  
- **Imported by (12):** `src/ValidatorUI/ValidatorDashboard.jsx`, `src/backroom/BloodGroupRegister.jsx`, `src/backroom/ESRRegister.jsx`, `src/backroom/RapidCardRegister.jsx`, `src/backroom/SerologyRegister.jsx`, `src/backroom/UrineAnalysisRegister.jsx`, `src/biochem_main/BiochemistryMain.jsx`, `src/biochem_main/HormonesMain.jsx`, `src/coagulation/CoagulationMain.jsx`, `src/haem/Haematology.jsx`, `src/inside_lab/InsideLab.jsx`, `src/outsource/Outsource.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/shared/hooks/useScopedMasterEntries.js`

- **Lines:** 102  
- **Purpose:** /** * Scoped master_register subscription only. * Incremental docChanges() after first seed. */  
- **Exports:** useScopedMasterEntries  
- **Imports from (6):** `react`, `firebase/firestore`, `../firestore/trackedFirestore.js`, `../firestore/incrementalDocStore.js`, `../../firebaseConfig.js`, `../utils/dates.js`  
- **Imported by (3):** `src/backroom/BloodGroupRegister.jsx`, `src/inside_lab/InsideLab.jsx`, `src/outsource/Outsource.jsx`  
- **Controls / signals:** Firestore listeners, React effects  

## `src/shared/utils/dates.js`

- **Lines:** 119  
- **Purpose:** /** * Shared date helpers — behavior-preserving extracts from department registers. */  
- **Exports:** getISTDateString, getISTLocaleString, getLocalDateString, istDayEndExclusive, istDayStart, localDayEndExclusive, localDayStart, minutesDiff, parseDateField, parseEntryDate, toDate, toLocalDateString  
- **Imports from (0):**   
- **Imported by (36):** `src/ValidatorUI/ValidatorDashboard.jsx`, `src/analytics/LabAnalytics.jsx`, `src/backroom/BloodGroupRegister.jsx`, `src/backroom/ESRRegister.jsx`, `src/backroom/RapidCardRegister.jsx`, `src/backroom/SerologyRegister.jsx`, `src/backroom/UrineAnalysisRegister.jsx`, `src/backup/BackupEntry.jsx`, `src/biochem_main/BiochemistryMain.jsx`, `src/biochem_main/HormonesMain.jsx`, `src/coagulation/CoagulationMain.jsx`, `src/critical/CriticalAlertDashboard.jsx`, `src/haem/Haematology.jsx`, `src/inside_lab/InsideLab.jsx`, `src/inventory-command-center/InventoryCommandCenter.jsx` …  
- **Controls / signals:** module definitions / UI / config  

## `src/shared/utils/ids.js`

- **Lines:** 14  
- **Purpose:** /** * Document / composite key helpers — preserve existing ID shapes. */  
- **Exports:** compositeId, safeKey  
- **Imports from (0):**   
- **Imported by (9):** `src/backroom/ESRRegister.jsx`, `src/backroom/RapidCardRegister.jsx`, `src/backroom/SerologyRegister.jsx`, `src/backroom/UrineAnalysisRegister.jsx`, `src/biochem_main/BiochemistryMain.jsx`, `src/biochem_main/HormonesMain.jsx`, `src/coagulation/CoagulationMain.jsx`, `src/haem/Haematology.jsx`, `src/shared/hooks/useMasterDeptSnapshots.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/shared/utils/normalizeTestsField.js`

- **Lines:** 27  
- **Purpose:** /** * Shared owner-analytics test-field normalization. * Behavior matches historical dataFetcher normalizeTestsField. */  
- **Exports:** normalizeTestsField  
- **Imports from (0):**   
- **Imported by (10):** `src/owner/lib/dataFetcher.js`, `src/owner/lib/dataFetcher_biochem_main.js`, `src/owner/lib/dataFetcher_bloodgroup_retesting.js`, `src/owner/lib/dataFetcher_bloodgroup_testing.js`, `src/owner/lib/dataFetcher_esr.js`, `src/owner/lib/dataFetcher_haem.js`, `src/owner/lib/dataFetcher_hormones_main.js`, `src/owner/lib/dataFetcher_rapid.js`, `src/owner/lib/dataFetcher_serology.js`, `src/owner/lib/dataFetcher_urine.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/shared/utils/normalizeTestsFieldUpper.js`

- **Lines:** 27  
- **Purpose:** /** * Uppercase test-field normalization used by Inside Lab / Outsource owner fetchers. * Preserves selectedTest + toUpperCase behaviour (different from normalizeTestsField). */  
- **Exports:** normalizeTestsFieldUpper  
- **Imports from (0):**   
- **Imported by (2):** `src/owner/lib/dataFetcher_lab.js`, `src/owner/lib/dataFetcher_outsource.js`  
- **Controls / signals:** module definitions / UI / config  

## `src/shared/utils/routineStageFlags.js`

- **Lines:** 68  
- **Purpose:** /** * Routine workflow stage cascade: * Entered ⇒ Validated ⇒ Saved ⇒ Scanned * Used for Master Register display and report_details write repair. */  
- **Exports:** cascadeRoutineStages, reportDetailsStageCascadeFields  
- **Imports from (0):**   
- **Imported by (2):** `src/ValidatorUI/ValidatorDashboard.jsx`, `src/master_register_2/MasterView_Rectangle.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/shared/utils/source.js`

- **Lines:** 12  
- **Purpose:** /** * Normalize patient source labels — matches existing department register behavior. */  
- **Exports:** normalizeSource  
- **Imports from (0):**   
- **Imported by (9):** `src/backroom/BloodGroupRegister.jsx`, `src/backroom/ESRRegister.jsx`, `src/backroom/RapidCardRegister.jsx`, `src/backroom/SerologyRegister.jsx`, `src/backroom/UrineAnalysisRegister.jsx`, `src/biochem_main/BiochemistryMain.jsx`, `src/biochem_main/HormonesMain.jsx`, `src/coagulation/CoagulationMain.jsx`, `src/haem/Haematology.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/shared/utils/tests.js`

- **Lines:** 31  
- **Purpose:** /** * Test-name helpers used across department registers. */  
- **Exports:** entryHasCanonicalTest, extractTestName, getTestName  
- **Imports from (0):**   
- **Imported by (4):** `src/biochem_main/BiochemistryMain.jsx`, `src/biochem_main/HormonesMain.jsx`, `src/coagulation/CoagulationMain.jsx`, `src/haem/Haematology.jsx`  
- **Controls / signals:** module definitions / UI / config  

## `src/test_mapping.json`

- **Lines:** 379  
- **Purpose:** Static configuration / routing / reference data.  
- **Exports:** —  
- **Imports from (0):**   
- **Imported by (3):** `src/mango.jsx`, `src/mango1.jsx`, `src/owner/workflow/workflowfetcher.js`  
- **Controls / signals:** module definitions / UI / config  

