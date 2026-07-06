
export const calculateTotalConsumption = (
  ledgerEntries
) => {

  return ledgerEntries.reduce(
    (sum, entry) =>
      sum +
      Number(
        entry.qtyDeducted || 0
      ),
    0
  );

};

export const groupConsumptionByDepartment = (
  ledgerEntries
) => {

  const grouped = {};

  ledgerEntries.forEach(entry => {

    const department =
      entry.deductedBy || "Unknown";

    if (!grouped[department]) {

      grouped[department] = 0;

    }

    grouped[department] += Number(
      entry.qtyDeducted || 0
    );

  });

  return grouped;

};

export const groupConsumptionByReagent = (
  ledgerEntries
) => {

  const grouped = {};

  ledgerEntries.forEach(entry => {

    const reagent =
      entry.reagentName || "Unknown";

    if (!grouped[reagent]) {

      grouped[reagent] = 0;

    }

    grouped[reagent] += Number(
      entry.qtyDeducted || 0
    );

  });

  return grouped;

};

export const getTopConsumedReagent = (
  ledgerEntries
) => {

  const grouped =
    groupConsumptionByReagent(
      ledgerEntries
    );

  let topReagent = null;

  let highest = 0;

  Object.entries(grouped).forEach(
    ([reagent, qty]) => {

      if (qty > highest) {

        highest = qty;

        topReagent = reagent;

      }

    }
  );

  return {
    reagent: topReagent,
    quantity: highest
  };

};