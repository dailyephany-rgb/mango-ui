
import { inventoryThresholds } from "../config/inventoryThresholds";

export const buildInventoryRows = (inventoryLogs) => {

  const grouped = {};

  inventoryLogs.forEach(item => {

    const name = item.reagentName;

    const inventoryType =
      item.inventoryType || "Reagent";

    const inventoryUnit =
      item.inventoryUnit ||
      (inventoryType === "Consumable"
        ? "Pack"
        : inventoryType === "Reagent"
        ? "Tests"
        : "ML");

        const qty =
        inventoryType === "Consumable"
          ? Number(item.quantity || 0)
          : inventoryUnit === "ML"
          ? Number(item.totalML || 0)
          : Number(item.totalTests || 0);
    if (!grouped[inventoryType]) {
      grouped[inventoryType] = {};
    }

    if (!grouped[inventoryType][name]) {

      grouped[inventoryType][name] = {
        reagentName: name,

        inventoryType,
        inventoryUnit,

        active: 0,
        storage: 0
      };
    }

    if (item.status === "Activated") {
      grouped[inventoryType][name].active += qty;
    }

    if (item.status === "In Storage") {
      grouped[inventoryType][name].storage += qty;
    }

  });

  const finalRows = {};

  Object.keys(grouped).forEach(type => {

    finalRows[type] = Object.values(
      grouped[type]
    ).map(row => {

      const thresholds =
        inventoryThresholds[
          row.reagentName
        ] || {
          baseline: 0,
          emergency: 0
        };

      const totalAvailable =
        row.active + row.storage;

      return {
        ...row,

        totalAvailable,

        baseline: thresholds.baseline,

        emergency: thresholds.emergency,

        isEmergency:
          totalAvailable <=
          thresholds.emergency
      };

    });

  });

  return finalRows;
};