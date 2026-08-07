# Mango LIMS Architecture — Part 2: File Inventory
> Generated from static analysis of `src/` (213 files). Companion to Part 1.
> Machine inventory JSON: [`_inventory.json`](./_inventory.json)

## How to read this inventory
For each file: **path**, lines, exports, import count (how many src files import it), key signals (listeners/effects).
“Critical” means: break this and clinical workflow, inventory integrity, or multi-page bootstrap fails.

## src (root)
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/Outsource.json` | 208 | (css/json) | 3 | — |  |
| `src/backroom_routing.json` | 36 | (css/json) | 7 | — |  |
| `src/biochem_testRouting.json` | 57 | (css/json) | 3 | — |  |
| `src/coag_testRouting.json` | 15 | (css/json) | 2 | — |  |
| `src/firebaseConfig.js` | 51 | db | 50 | — | Yes |
| `src/hormone_testRouting.json` | 39 | (css/json) | 2 | — |  |
| `src/inside_room_routing.json` | 49 | (css/json) | 3 | — |  |
| `src/main.jsx` | 82 | — | 0 | — |  |
| `src/main_analytics.jsx` | 17 | — | 0 | — |  |
| `src/main_backroom.jsx` | 11 | — | 0 | — |  |
| `src/main_backup.jsx` | 10 | — | 0 | — |  |
| `src/main_biochem.jsx` | 11 | — | 0 | — |  |
| `src/main_coag.jsx` | 11 | — | 0 | — |  |
| `src/main_commandcenter.jsx` | 39 | — | 0 | — |  |
| `src/main_critical.jsx` | 10 | — | 0 | — |  |
| `src/main_haem.jsx` | 12 | — | 0 | — |  |
| `src/main_inside_lab.jsx` | 15 | — | 0 | — |  |
| `src/main_inventory.jsx` | 19 | — | 0 | — |  |
| `src/main_login.jsx` | 10 | — | 0 | — |  |
| `src/main_master_admin.jsx` | 20 | — | 0 | — |  |
| `src/main_outsource.jsx` | 15 | — | 0 | — |  |
| `src/main_owner.jsx` | 19 | — | 0 | — |  |
| `src/main_owner_biochem.jsx` | 16 | — | 0 | — |  |
| `src/main_owner_blood_group.jsx` | 18 | — | 0 | — |  |
| `src/main_owner_bloodgroup.jsx` | 15 | — | 0 | — |  |
| `src/main_owner_coag.jsx` | 21 | — | 0 | — |  |
| `src/main_owner_esr.jsx` | 21 | — | 0 | — |  |
| `src/main_owner_haem.jsx` | 25 | — | 0 | — |  |
| `src/main_owner_hormones.jsx` | 22 | — | 0 | — |  |
| `src/main_owner_lab.jsx` | 16 | — | 0 | — |  |
| `src/main_owner_outsource.jsx` | 17 | — | 0 | — |  |
| `src/main_owner_rapid.jsx` | 18 | — | 0 | — |  |
| `src/main_owner_serology.jsx` | 21 | — | 0 | — |  |
| `src/main_owner_urine.jsx` | 15 | — | 0 | — |  |
| `src/main_performance.jsx` | 10 | — | 0 | — |  |
| `src/main_validator.jsx` | 12 | — | 0 | — |  |
| `src/mango.css` | 271 | (css/json) | 0 | — |  |
| `src/mango.jsx` | 698 | default | 1 | useEffect×4, getDoc×4 | Yes |
| `src/mango1.jsx` | 592 | default | 0 | useEffect×3, getDoc×4 |  |
| `src/test_mapping.json` | 379 | (css/json) | 3 | — |  |

## src/ValidatorUI
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/ValidatorUI/ValidatorDashboard.css` | 271 | (css/json) | 0 | — |  |
| `src/ValidatorUI/ValidatorDashboard.jsx` | 353 | default | 1 | onSnapshot×3, useEffect×2, getDoc×3 | Yes |
| `src/ValidatorUI/ValidatorTable.jsx` | 273 | default | 1 | — |  |
| `src/ValidatorUI/validatorConfig.js` | 73 | validatorConfigs | 0 | — |  |

## src/analytics
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/analytics/LabAnalytics.jsx` | 452 | default | 1 | onSnapshot×3, useEffect×3 |  |
| `src/analytics/analyticsUtils.js` | 36 | getCountByTest | 1 | — |  |
| `src/analytics/css/LabAnalytics.css` | 127 | (css/json) | 0 | — |  |
| `src/analytics/css/LabAnalytics1.css` | 99 | (css/json) | 0 | — |  |
| `src/analytics/testRoutingMap.json` | 289 | (css/json) | 1 | — |  |

## src/auth
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/auth/AuthGuard.js` | 17 | requireLogin | 0 | — |  |
| `src/auth/LoginPage.css` | 49 | (css/json) | 0 | — |  |
| `src/auth/LoginPage.jsx` | 106 | default | 1 | — |  |
| `src/auth/UserMenu.jsx` | 63 | default | 9 | — |  |
| `src/auth/users.js` | 177 | departments, users | 1 | — |  |

## src/backroom
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/backroom/Backroom.css` | 442 | (css/json) | 0 | — |  |
| `src/backroom/BackroomMain.jsx` | 121 | default | 1 | — |  |
| `src/backroom/BloodGroupRegister.jsx` | 504 | default | 1 | onSnapshot×4, useEffect×2 |  |
| `src/backroom/ESRRegister.jsx` | 555 | default | 1 | — |  |
| `src/backroom/RapidCardRegister.jsx` | 829 | default | 1 | — |  |
| `src/backroom/SerologyRegister.jsx` | 641 | default | 1 | — |  |
| `src/backroom/UrineAnalysisRegister.jsx` | 659 | default | 1 | — |  |

## src/backup
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/backup/BackupEntry.css` | 309 | (css/json) | 0 | — |  |
| `src/backup/BackupEntry.jsx` | 368 | default | 1 | onSnapshot×3, useEffect×2 |  |

## src/biochem_main
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/biochem_main/BiochemistryMain.css` | 285 | (css/json) | 0 | — |  |
| `src/biochem_main/BiochemistryMain.jsx` | 562 | default | 1 | useEffect×1 | Yes |
| `src/biochem_main/HormonesMain.jsx` | 482 | default | 1 | useEffect×1 |  |

## src/coagulation
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/coagulation/CoagulationMain.css` | 346 | (css/json) | 0 | — |  |
| `src/coagulation/CoagulationMain.jsx` | 855 | default | 1 | — |  |

## src/critical
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/critical/CriticalAlertDashboard.jsx` | 435 | default | 1 | onSnapshot×3, useEffect×3 |  |
| `src/critical/CriticalDashboard.css` | 310 | (css/json) | 0 | — |  |

## src/doc
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/doc/listener-counts-2026-08-02.json` | 634 | (css/json) | 0 | getDocs×1 |  |

## src/haem
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/haem/Haematology.css` | 446 | (css/json) | 0 | — |  |
| `src/haem/Haematology.jsx` | 647 | default | 1 | useEffect×2 | Yes |

## src/inside_lab
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/inside_lab/InsideLab.css` | 151 | (css/json) | 0 | — |  |
| `src/inside_lab/InsideLab.jsx` | 497 | default | 1 | onSnapshot×3, useEffect×2, getDoc×3 |  |

## src/inventory
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/inventory/BackroomInventoryTab.jsx` | 1555 | default | 1 | useEffect×2 |  |
| `src/inventory/BackupInventoryTab.jsx` | 1675 | default | 1 | useEffect×2 |  |
| `src/inventory/CoagulationInventoryTab.jsx` | 1419 | default | 1 | useEffect×2 |  |
| `src/inventory/DeptInventory.css` | 217 | (css/json) | 0 | — |  |
| `src/inventory/DeptInventoryTab.jsx` | 1787 | default | 2 | useEffect×2 |  |
| `src/inventory/HaemInventoryTab.jsx` | 1535 | default | 1 | useEffect×2 |  |
| `src/inventory/InventoryAdjustmentTab.jsx` | 473 | default | 1 | onSnapshot×3, useEffect×2 |  |
| `src/inventory/InventoryCommandCentre.jsx` | 35 | default | 0 | — |  |
| `src/inventory/InventoryIntake.css` | 236 | (css/json) | 0 | — |  |
| `src/inventory/InventoryIntake.jsx` | 508 | default | 1 | onSnapshot×4, useEffect×4 |  |
| `src/inventory/inventorymapping.js` | 775 | getVitrosDeductibleTests, handleInventoryDeduction, testToReagentMap | 9 | getDocs×4, getDoc×4 | Yes |
| `src/inventory/reagents.json` | 292 | (css/json) | 1 | — |  |

## src/inventory-command-center
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/inventory-command-center/InventoryCommandCenter.jsx` | 336 | default | 1 | onSnapshot×8, useEffect×6 |  |
| `src/inventory-command-center/commandcenter.css` | 327 | (css/json) | 0 | — |  |
| `src/inventory-command-center/components/CommandCenterHeader.jsx` | 44 | default | 0 | — |  |
| `src/inventory-command-center/components/DateRangeFilter.jsx` | 38 | default | 5 | — |  |
| `src/inventory-command-center/components/DepartmentFilter.jsx` | 40 | default | 1 | — |  |
| `src/inventory-command-center/components/EmergencyBadge.jsx` | 32 | default | 3 | — |  |
| `src/inventory-command-center/components/HealthIndicator.jsx` | 69 | default | 0 | — |  |
| `src/inventory-command-center/components/MetricCard.jsx` | 27 | default | 3 | — |  |
| `src/inventory-command-center/config/inventoryThresholds.js` | 15 | inventoryThresholds | 1 | — |  |
| `src/inventory-command-center/tabs/ComboConsumptionLedgerTab.jsx` | 1048 | default | 1 | — |  |
| `src/inventory-command-center/tabs/ConsumedInventoryTab.jsx` | 589 | default | 1 | — |  |
| `src/inventory-command-center/tabs/ConsumptionLedgerTab.jsx` | 947 | default | 1 | — |  |
| `src/inventory-command-center/tabs/CostAnalyticsTab.jsx` | 998 | default | 1 | — |  |
| `src/inventory-command-center/tabs/ExpirySurveillanceTab.jsx` | 252 | default | 1 | — |  |
| `src/inventory-command-center/tabs/LiveInventoryTab.jsx` | 285 | default | 1 | — |  |
| `src/inventory-command-center/tabs/QCMonitorTab.jsx` | 1014 | default | 1 | — |  |
| `src/inventory-command-center/utils/Expiryutils.js` | 74 | calculateDaysLeft, filterExpiringInventory, getRiskLabel, isExpiringSoon | 1 | — |  |
| `src/inventory-command-center/utils/consumptionledger.js` | 42 | addConsumptionLedgerEntry | 6 | — |  |
| `src/inventory-command-center/utils/inventoryAggregations.js` | 94 | buildInventoryRows | 1 | — |  |
| `src/inventory-command-center/utils/ledgerUtils.js` | 103 | calculateTotalConsumption, getTopConsumedReagent, groupConsumptionByDepartment, groupConsumptionByReagent | 0 | — |  |
| `src/inventory-command-center/utils/qcUtils.js` | 69 | calculateQCFailureCount, formatQCStatus, groupQCByDepartment, isQCFailure | 1 | — |  |

## src/master
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/master/MasterView_Table.css` | 227 | (css/json) | 0 | — |  |
| `src/master/MasterView_Table.jsx` | 169 | default | 1 | — |  |
| `src/master/MasterView_Table1.jsx` | 173 | default | 0 | onSnapshot×3, useEffect×2 |  |

## src/master_admin
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/master_admin/MasterAdmin.css` | 254 | (css/json) | 0 | — |  |
| `src/master_admin/MasterAdmin.jsx` | 604 | default | 1 | onSnapshot×3, useEffect×2 |  |
| `src/master_admin/MasterAdmin1.jsx` | 585 | default | 0 | onSnapshot×3, useEffect×2 |  |

## src/master_register_2
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/master_register_2/MasterView_Rectangle.css` | 666 | (css/json) | 0 | — |  |
| `src/master_register_2/MasterView_Rectangle.jsx` | 1090 | default | 1 | onSnapshot×3, useEffect×3 |  |
| `src/master_register_2/main.jsx` | 81 | — | 0 | — |  |

## src/outsource
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/outsource/Outsource.css` | 273 | (css/json) | 0 | — |  |
| `src/outsource/Outsource.jsx` | 671 | default | 1 | onSnapshot×3, useEffect×3, getDoc×6 |  |

## src/owner
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/owner/OwnerApp.jsx` | 193 | default | 1 | useEffect×2 |  |
| `src/owner/OwnerBiochem.jsx` | 767 | default | 1 | useEffect×2 |  |
| `src/owner/OwnerBloodGroup.jsx` | 835 | default | 2 | useEffect×3 |  |
| `src/owner/OwnerCoag.jsx` | 836 | default | 1 | useEffect×2 |  |
| `src/owner/OwnerContext.jsx` | 29 | OwnerContext, OwnerProvider | 30 | — | Yes |
| `src/owner/OwnerESRPage.jsx` | 819 | default | 1 | useEffect×2 |  |
| `src/owner/OwnerHaemPage.jsx` | 790 | default | 1 | useEffect×2 |  |
| `src/owner/OwnerHormones.jsx` | 801 | default | 1 | useEffect×2 |  |
| `src/owner/OwnerLabPage.jsx` | 183 | default | 1 | useEffect×2 |  |
| `src/owner/OwnerOutsourcePage.jsx` | 616 | default | 1 | useEffect×2 |  |
| `src/owner/OwnerRapidPage.jsx` | 814 | default | 1 | useEffect×2 |  |
| `src/owner/OwnerSerology.jsx` | 862 | default | 1 | useEffect×2 |  |
| `src/owner/OwnerUI.css` | 189 | (css/json) | 0 | — |  |
| `src/owner/OwnerUrine.jsx` | 820 | default | 1 | useEffect×2 |  |
| `src/owner/charts/CountsBar.jsx` | 44 | default | 9 | — |  |
| `src/owner/charts/CountsBarInside.jsx` | 32 | default | 1 | — |  |
| `src/owner/charts/CountsBarOutsource.jsx` | 37 | default | 1 | — |  |
| `src/owner/charts/DelayHistogram.jsx` | 39 | default | 11 | — |  |
| `src/owner/charts/SLAScoreDonut.jsx` | 47 | default | 11 | — |  |
| `src/owner/charts/StackedStageLines.jsx` | 318 | default | 9 | — |  |
| `src/owner/charts/StackedStageLinesInside.jsx` | 66 | default | 1 | — |  |
| `src/owner/charts/StackedStageLinesOutsource.jsx` | 293 | default | 1 | — |  |
| `src/owner/charts/StaffAvgCards.jsx` | 109 | default | 9 | — |  |
| `src/owner/charts/StaffDistribution.jsx` | 251 | default | 11 | — |  |
| `src/owner/charts/StaffTimeline.jsx` | 374 | default | 9 | useEffect×2 |  |
| `src/owner/charts/TimeBricks.css` | 123 | (css/json) | 0 | — |  |
| `src/owner/charts/TimeBricks.jsx` | 163 | default | 10 | useEffect×2 |  |
| `src/owner/charts/TimeBricksOutsource.css` | 69 | (css/json) | 0 | — |  |
| `src/owner/charts/TimeBricksOutsource.jsx` | 197 | default | 1 | — |  |
| `src/owner/components/DateSourceFilter.jsx` | 60 | default | 12 | — |  |
| `src/owner/components/DelayTable.jsx` | 76 | default | 11 | — |  |
| `src/owner/components/KPIBlocks.jsx` | 124 | default | 8 | — |  |
| `src/owner/components/KPIBlocksInside.jsx` | 73 | default | 1 | — |  |
| `src/owner/components/KPIBlocksOutsource.jsx` | 100 | default | 1 | — |  |
| `src/owner/components/KPIBlocks_BloodGroup.jsx` | 116 | default | 1 | — |  |
| `src/owner/components/PatientListModal.jsx` | 74 | default | 9 | — |  |
| `src/owner/components/PatientListModalInside.jsx` | 56 | default | 1 | — |  |
| `src/owner/components/PatientListModalOutsource.jsx` | 86 | default | 1 | — |  |
| `src/owner/data/test_timings.json` | 53 | (css/json) | 14 | — |  |
| `src/owner/lib/dataFetcher.js` | 772 | computeKPIs, computeSLAViolations, computeStaffAnalytics, extractCoagTestCount, fetchTestTimings, isCoagTest, mergeDeptRows, minutesDiff, … | 1 | onSnapshot×4 |  |
| `src/owner/lib/dataFetcher_biochem_main.js` | 580 | computeKPIs, computeSLAViolations, computeStaffAnalytics, extractBiochemMainTestCount, fetchTestTimings, isBiochemMainTest, mergeDeptRows, minutesDiff, … | 1 | onSnapshot×4 |  |
| `src/owner/lib/dataFetcher_bloodgroup_retesting.js` | 501 | computeKPIs, computeSLAViolations, computeStaffAnalytics, extractBloodGroupTestCount, fetchTestTimings, isBloodGroupTest, mergeDeptRows, minutesDiff, … | 1 | onSnapshot×4 |  |
| `src/owner/lib/dataFetcher_bloodgroup_testing.js` | 594 | computeKPIs, computeSLAViolations, computeStaffAnalytics, extractBloodGroupTestCount, fetchTestTimings, isBloodGroupTest, mergeDeptRows, minutesDiff, … | 1 | onSnapshot×4 |  |
| `src/owner/lib/dataFetcher_esr.js` | 760 | computeKPIs, computeSLAViolations, computeStaffAnalytics, extractESRTestCount, fetchTestTimings, isESRTest, mergeDeptRows, minutesDiff, … | 1 | onSnapshot×4 |  |
| `src/owner/lib/dataFetcher_haem.js` | 696 | computeKPIs, computeSLAViolations, computeStaffAnalytics, extractHaemTestCount, fetchTestTimings, isHaemTest, mergeDeptRows, minutesDiff, … | 1 | onSnapshot×4 |  |
| `src/owner/lib/dataFetcher_hormones_main.js` | 563 | computeKPIs, computeSLAViolations, computeStaffAnalytics, extractHormonesMainTestCount, fetchTestTimings, isHormonesMainTest, mergeDeptRows, minutesDiff, … | 1 | onSnapshot×4 |  |
| `src/owner/lib/dataFetcher_lab.js` | 293 | computeKPIs, mergeDeptRows, minutesDiff, normalizeTestsField, subscribeOverview, toDate | 1 | onSnapshot×4 |  |
| `src/owner/lib/dataFetcher_outsource.js` | 518 | computeKPIs, formatTAT, mergeOutsourceRows, minutesDiff, normalizeTestsField, subscribeOverview, toDate | 1 | onSnapshot×4 |  |
| `src/owner/lib/dataFetcher_rapid.js` | 793 | computeKPIs, computeSLAViolations, computeStaffAnalytics, extractRapidTestCount, fetchTestTimings, isRapidTest, mergeDeptRows, minutesDiff, … | 1 | onSnapshot×4 |  |
| `src/owner/lib/dataFetcher_serology.js` | 784 | computeKPIs, computeSLAViolations, computeStaffAnalytics, extractSerologyTestCount, fetchTestTimings, isSerologyTest, mergeDeptRows, minutesDiff, … | 1 | onSnapshot×4 |  |
| `src/owner/lib/dataFetcher_urine.js` | 606 | computeKPIs, computeSLAViolations, computeStaffAnalytics, extractUrineTestCount, fetchTestTimings, isUrineTest, mergeDeptRows, minutesDiff, … | 1 | onSnapshot×4 |  |
| `src/owner/lib/withOwnerSourceControl.js` | 25 | withOwnerSourceControl | 13 | — |  |
| `src/owner/workflow/WorkflowKPIBlocks.jsx` | 131 | default | 1 | — |  |
| `src/owner/workflow/WorkflowStackedBars.jsx` | 404 | default | 1 | — |  |
| `src/owner/workflow/WorkflowStaffDistribution.jsx` | 280 | default | 1 | — |  |
| `src/owner/workflow/workflowfetcher.js` | 753 | ROUTINE_WORKFLOW_CHART_KEYS, ROUTINE_WORKFLOW_COLORS, ROUTINE_WORKFLOW_LABELS, ROUTINE_WORKFLOW_LOOKUP, SPECIAL_WORKFLOW_LOOKUP, buildWorkflowSummary, mergeWorkflowRecords, subscribeToWorkflowAnalytics | 2 | onSnapshot×3 |  |

## src/performance
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/performance/Performance.css` | 326 | (css/json) | 0 | — |  |
| `src/performance/PerformanceContext.jsx` | 318 | PerformanceProvider, usePerf | 1 | useEffect×3 |  |
| `src/performance/PerformanceDashboard.jsx` | 903 | default | 1 | useEffect×2 |  |
| `src/performance/bootstrap.js` | 209 | startPerformanceMonitoring | 0 | — |  |
| `src/performance/cacheMetrics.js` | 57 | summarizeCache | 5 | — |  |
| `src/performance/exportPerformancePdf.js` | 747 | downloadPerformancePdf | 0 | — |  |
| `src/performance/firestoreMetrics.js` | 131 | classifyCollection, departmentForCollection, extractCollectionName, resolvePageIdentity | 3 | — |  |
| `src/performance/healthScorer.js` | 407 | band, buildDepartmentRankings, buildQueryLeaderboard, computeAlerts, computeHealthScores, countDuplicateListeners, getHealthHistory, persistTodayHealth | 3 | — |  |
| `src/performance/networkMetrics.js` | 85 | dayEndExclusiveMs, dayStartMs, filterByDateRange, filterSince, percentile, sinceMs, startOfTodayMs, summarizeDurations, … | 5 | — |  |
| `src/performance/pageLoadBands.js` | 39 | PAGE_LOAD_BAND_LEGEND, PAGE_LOAD_GREEN_MS, PAGE_LOAD_ORANGE_MS, PAGE_LOAD_RED_MS, PAGE_LOAD_SLOW_MS, PAGE_LOAD_YELLOW_MS, loadBand, loadBandLabel | 6 | — |  |
| `src/performance/perfDailyFirestore.js` | 291 | buildSessionDayRollup, combineLocalAndRemoteRollups, fetchPerfDailyRange, flushPerfDaily, getPerfClientId, mergeUniqueByAt, schedulePerfDailyFlush | 2 | getDocs×2, getDoc×2 |  |
| `src/performance/performanceCollector.js` | 307 | closeListener, finalizePageLoad, getPageContext, markCacheHitOnLoad, markPageLoadStart, onFirstSnapshot, recordCacheEvent, recordEvent, … | 2 | — |  |
| `src/performance/performanceStore.js` | 391 | addCountedReads, clearMetrics, estimateCachePayloadBytes, estimatePerfStoreBytes, estimateSessionStorageBytes, exportMetricsJson, flushCountedReads, flushPersist, … | 8 | — |  |
| `src/performance/renderMetrics.js` | 63 | getHeapEstimate, startLongTaskObserver, stopLongTaskObserver | 4 | — |  |
| `src/performance/rollupMerge.js` | 138 | ROLLUP_CAPS, flattenRollupSamples, mergeRollupRecords, mergeUniqueByAt, sampleKey | 5 | — |  |

## src/shared
| File | Lines | Exports | Imported by (count) | Signals | Critical |
|---|---:|---|---:|---|---|
| `src/shared/cache/createOwnerSessionPaint.js` | 66 | createOwnerSessionPaint | 13 | — |  |
| `src/shared/cache/sessionQueryCache.js` | 180 | SESSION_QUERY_TTL_MS, clearExpired, getCache, ownerCacheKey, removeCache, setCache | 4 | — |  |
| `src/shared/cache/staticConfigCache.js` | 30 | STATIC_CONFIG_TTL_MS, getStaticConfig, removeStaticConfig, setStaticConfig | 2 | — |  |
| `src/shared/components/CriticalAlertModal.jsx` | 94 | default | 8 | — |  |
| `src/shared/components/RegisterFilterBar.jsx` | 69 | default | 10 | — |  |
| `src/shared/config/collections.js` | 77 | COMPLETION_FIELDS, MASTER_ADMIN_DEPARTMENTS, PERF_DAILY_COLLECTION, ROUTINE_DEPARTMENTS, VALIDATOR_COLLECTIONS, VALIDATOR_DATE_FIELDS | 4 | — | Yes |
| `src/shared/firestore/incrementalDocStore.js` | 146 | compareByTimePrinted, createIncrementalDocStore | 4 | — |  |
| `src/shared/firestore/scopedTimePrintedQuery.js` | 29 | scopedTimePrintedQuery | 13 | — | Yes |
| `src/shared/firestore/scopedTimestampRangeQuery.js` | 38 | scopedTimestampRangeQuery | 2 | — |  |
| `src/shared/firestore/subscribeInventoryByMachines.js` | 106 | INVENTORY_LIVE_STATUSES, INVENTORY_MACHINES, subscribeInventoryByMachines | 7 | onSnapshot×3 | Yes |
| `src/shared/firestore/trackedFirestore.js` | 195 | trackedGetDoc, trackedGetDocs, trackedOnSnapshot | 34 | onSnapshot×4, getDocs×6, getDoc×7 | Yes |
| `src/shared/hooks/useMasterDeptSnapshots.js` | 297 | useMasterDeptSnapshots | 8 | onSnapshot×5, useEffect×2 | Yes |
| `src/shared/hooks/useMasterRegisterSnapshots.js` | 114 | useMasterRegisterSnapshots | 1 | onSnapshot×3, useEffect×2 |  |
| `src/shared/hooks/usePersistedObjectState.js` | 34 | usePersistedObjectState | 10 | useEffect×2 |  |
| `src/shared/hooks/useRegisterFilters.js` | 27 | useRegisterFilters | 12 | — |  |
| `src/shared/hooks/useScopedMasterEntries.js` | 102 | useScopedMasterEntries | 3 | onSnapshot×3, useEffect×2 |  |
| `src/shared/utils/dates.js` | 119 | getISTDateString, getISTLocaleString, getLocalDateString, istDayEndExclusive, istDayStart, localDayEndExclusive, localDayStart, minutesDiff, … | 36 | — |  |
| `src/shared/utils/ids.js` | 14 | compositeId, safeKey | 9 | — |  |
| `src/shared/utils/normalizeTestsField.js` | 27 | normalizeTestsField | 10 | — |  |
| `src/shared/utils/normalizeTestsFieldUpper.js` | 27 | normalizeTestsFieldUpper | 2 | — |  |
| `src/shared/utils/routineStageFlags.js` | 68 | cascadeRoutineStages, reportDetailsStageCascadeFields | 2 | — |  |
| `src/shared/utils/source.js` | 12 | normalizeSource | 9 | — |  |
| `src/shared/utils/tests.js` | 31 | entryHasCanonicalTest, extractTestName, getTestName | 4 | — |  |

## Critical file importers
### `src/ValidatorUI/ValidatorDashboard.jsx`
- Named exports: (default only)
- Imported by (1):
  - `src/main_validator.jsx`

### `src/biochem_main/BiochemistryMain.jsx`
- Named exports: (default only)
- Imported by (1):
  - `src/main_biochem.jsx`

### `src/firebaseConfig.js`
- Named exports: db
- Imported by (50):
  - `src/ValidatorUI/ValidatorDashboard.jsx`
  - `src/backroom/BloodGroupRegister.jsx`
  - `src/backroom/ESRRegister.jsx`
  - `src/backroom/RapidCardRegister.jsx`
  - `src/backroom/SerologyRegister.jsx`
  - `src/backroom/UrineAnalysisRegister.jsx`
  - `src/backup/BackupEntry.jsx`
  - `src/biochem_main/BiochemistryMain.jsx`
  - `src/biochem_main/HormonesMain.jsx`
  - `src/coagulation/CoagulationMain.jsx`
  - `src/critical/CriticalAlertDashboard.jsx`
  - `src/haem/Haematology.jsx`
  - `src/inside_lab/InsideLab.jsx`
  - `src/inventory-command-center/InventoryCommandCenter.jsx`
  - `src/inventory-command-center/utils/consumptionledger.js`
  - `src/inventory/BackroomInventoryTab.jsx`
  - `src/inventory/BackupInventoryTab.jsx`
  - `src/inventory/CoagulationInventoryTab.jsx`
  - `src/inventory/DeptInventoryTab.jsx`
  - `src/inventory/HaemInventoryTab.jsx`
  - `src/inventory/InventoryAdjustmentTab.jsx`
  - `src/inventory/InventoryIntake.jsx`
  - `src/inventory/inventorymapping.js`
  - `src/mango.jsx`
  - `src/mango1.jsx`
  - `src/master/MasterView_Table.jsx`
  - `src/master/MasterView_Table1.jsx`
  - `src/master_admin/MasterAdmin.jsx`
  - `src/master_admin/MasterAdmin1.jsx`
  - `src/master_register_2/MasterView_Rectangle.jsx`
  - `src/outsource/Outsource.jsx`
  - `src/owner/lib/dataFetcher.js`
  - `src/owner/lib/dataFetcher_biochem_main.js`
  - `src/owner/lib/dataFetcher_bloodgroup_retesting.js`
  - `src/owner/lib/dataFetcher_bloodgroup_testing.js`
  - `src/owner/lib/dataFetcher_esr.js`
  - `src/owner/lib/dataFetcher_haem.js`
  - `src/owner/lib/dataFetcher_hormones_main.js`
  - `src/owner/lib/dataFetcher_lab.js`
  - `src/owner/lib/dataFetcher_outsource.js`
  - `src/owner/lib/dataFetcher_rapid.js`
  - `src/owner/lib/dataFetcher_serology.js`
  - `src/owner/lib/dataFetcher_urine.js`
  - `src/performance/perfDailyFirestore.js`
  - `src/shared/firestore/scopedTimePrintedQuery.js`
  - `src/shared/firestore/scopedTimestampRangeQuery.js`
  - `src/shared/firestore/subscribeInventoryByMachines.js`
  - `src/shared/hooks/useMasterDeptSnapshots.js`
  - `src/shared/hooks/useMasterRegisterSnapshots.js`
  - `src/shared/hooks/useScopedMasterEntries.js`

### `src/haem/Haematology.jsx`
- Named exports: (default only)
- Imported by (1):
  - `src/main_haem.jsx`

### `src/inventory/inventorymapping.js`
- Named exports: getVitrosDeductibleTests, handleInventoryDeduction, testToReagentMap
- Imported by (9):
  - `src/backroom/RapidCardRegister.jsx`
  - `src/backroom/SerologyRegister.jsx`
  - `src/backroom/UrineAnalysisRegister.jsx`
  - `src/backup/BackupEntry.jsx`
  - `src/biochem_main/BiochemistryMain.jsx`
  - `src/biochem_main/HormonesMain.jsx`
  - `src/coagulation/CoagulationMain.jsx`
  - `src/haem/Haematology.jsx`
  - `src/inventory/BackupInventoryTab.jsx`

### `src/mango.jsx`
- Named exports: (default only)
- Imported by (1):
  - `src/main.jsx`

### `src/owner/OwnerContext.jsx`
- Named exports: OwnerContext, OwnerProvider
- Imported by (30):
  - `src/main_analytics.jsx`
  - `src/main_commandcenter.jsx`
  - `src/main_inventory.jsx`
  - `src/main_master_admin.jsx`
  - `src/main_owner.jsx`
  - `src/main_owner_biochem.jsx`
  - `src/main_owner_blood_group.jsx`
  - `src/main_owner_bloodgroup.jsx`
  - `src/main_owner_coag.jsx`
  - `src/main_owner_esr.jsx`
  - `src/main_owner_haem.jsx`
  - `src/main_owner_hormones.jsx`
  - `src/main_owner_lab.jsx`
  - `src/main_owner_outsource.jsx`
  - `src/main_owner_rapid.jsx`
  - `src/main_owner_serology.jsx`
  - `src/main_owner_urine.jsx`
  - `src/owner/OwnerApp.jsx`
  - `src/owner/OwnerBiochem.jsx`
  - `src/owner/OwnerBloodGroup.jsx`
  - `src/owner/OwnerCoag.jsx`
  - `src/owner/OwnerESRPage.jsx`
  - `src/owner/OwnerHaemPage.jsx`
  - `src/owner/OwnerHormones.jsx`
  - `src/owner/OwnerLabPage.jsx`
  - `src/owner/OwnerOutsourcePage.jsx`
  - `src/owner/OwnerRapidPage.jsx`
  - `src/owner/OwnerSerology.jsx`
  - `src/owner/OwnerUrine.jsx`
  - `src/owner/components/DateSourceFilter.jsx`

### `src/shared/config/collections.js`
- Named exports: COMPLETION_FIELDS, MASTER_ADMIN_DEPARTMENTS, PERF_DAILY_COLLECTION, ROUTINE_DEPARTMENTS, VALIDATOR_COLLECTIONS, VALIDATOR_DATE_FIELDS
- Imported by (4):
  - `src/ValidatorUI/ValidatorDashboard.jsx`
  - `src/master_admin/MasterAdmin.jsx`
  - `src/master_admin/MasterAdmin1.jsx`
  - `src/performance/perfDailyFirestore.js`

### `src/shared/firestore/scopedTimePrintedQuery.js`
- Named exports: scopedTimePrintedQuery
- Imported by (13):
  - `src/owner/lib/dataFetcher.js`
  - `src/owner/lib/dataFetcher_biochem_main.js`
  - `src/owner/lib/dataFetcher_bloodgroup_retesting.js`
  - `src/owner/lib/dataFetcher_bloodgroup_testing.js`
  - `src/owner/lib/dataFetcher_esr.js`
  - `src/owner/lib/dataFetcher_haem.js`
  - `src/owner/lib/dataFetcher_hormones_main.js`
  - `src/owner/lib/dataFetcher_lab.js`
  - `src/owner/lib/dataFetcher_outsource.js`
  - `src/owner/lib/dataFetcher_rapid.js`
  - `src/owner/lib/dataFetcher_serology.js`
  - `src/owner/lib/dataFetcher_urine.js`
  - `src/owner/workflow/workflowfetcher.js`

### `src/shared/firestore/subscribeInventoryByMachines.js`
- Named exports: INVENTORY_LIVE_STATUSES, INVENTORY_MACHINES, subscribeInventoryByMachines
- Imported by (7):
  - `src/haem/Haematology.jsx`
  - `src/inventory-command-center/InventoryCommandCenter.jsx`
  - `src/inventory/BackroomInventoryTab.jsx`
  - `src/inventory/BackupInventoryTab.jsx`
  - `src/inventory/CoagulationInventoryTab.jsx`
  - `src/inventory/DeptInventoryTab.jsx`
  - `src/inventory/HaemInventoryTab.jsx`

### `src/shared/firestore/trackedFirestore.js`
- Named exports: trackedGetDoc, trackedGetDocs, trackedOnSnapshot
- Imported by (34):
  - `src/ValidatorUI/ValidatorDashboard.jsx`
  - `src/analytics/LabAnalytics.jsx`
  - `src/backroom/BloodGroupRegister.jsx`
  - `src/backup/BackupEntry.jsx`
  - `src/critical/CriticalAlertDashboard.jsx`
  - `src/inside_lab/InsideLab.jsx`
  - `src/inventory-command-center/InventoryCommandCenter.jsx`
  - `src/inventory/InventoryAdjustmentTab.jsx`
  - `src/inventory/InventoryIntake.jsx`
  - `src/inventory/inventorymapping.js`
  - `src/mango.jsx`
  - `src/mango1.jsx`
  - `src/master/MasterView_Table1.jsx`
  - `src/master_admin/MasterAdmin.jsx`
  - `src/master_admin/MasterAdmin1.jsx`
  - `src/master_register_2/MasterView_Rectangle.jsx`
  - `src/outsource/Outsource.jsx`
  - `src/owner/lib/dataFetcher.js`
  - `src/owner/lib/dataFetcher_biochem_main.js`
  - `src/owner/lib/dataFetcher_bloodgroup_retesting.js`
  - `src/owner/lib/dataFetcher_bloodgroup_testing.js`
  - `src/owner/lib/dataFetcher_esr.js`
  - `src/owner/lib/dataFetcher_haem.js`
  - `src/owner/lib/dataFetcher_hormones_main.js`
  - `src/owner/lib/dataFetcher_lab.js`
  - `src/owner/lib/dataFetcher_outsource.js`
  - `src/owner/lib/dataFetcher_rapid.js`
  - `src/owner/lib/dataFetcher_serology.js`
  - `src/owner/lib/dataFetcher_urine.js`
  - `src/owner/workflow/workflowfetcher.js`
  - `src/shared/firestore/subscribeInventoryByMachines.js`
  - `src/shared/hooks/useMasterDeptSnapshots.js`
  - `src/shared/hooks/useMasterRegisterSnapshots.js`
  - `src/shared/hooks/useScopedMasterEntries.js`

### `src/shared/hooks/useMasterDeptSnapshots.js`
- Named exports: useMasterDeptSnapshots
- Imported by (8):
  - `src/backroom/ESRRegister.jsx`
  - `src/backroom/RapidCardRegister.jsx`
  - `src/backroom/SerologyRegister.jsx`
  - `src/backroom/UrineAnalysisRegister.jsx`
  - `src/biochem_main/BiochemistryMain.jsx`
  - `src/biochem_main/HormonesMain.jsx`
  - `src/coagulation/CoagulationMain.jsx`
  - `src/haem/Haematology.jsx`

