
export const calculateDaysLeft = (
  expiryDate
) => {

  if (!expiryDate) {
    return null;
  }

  const today = new Date();

  const expiry = new Date(expiryDate);

  return Math.ceil(
    (expiry - today) /
    (1000 * 60 * 60 * 24)
  );

};

export const getRiskLabel = (
  daysLeft
) => {

  if (daysLeft <= 3) {
    return "CRITICAL";
  }

  if (daysLeft <= 7) {
    return "HIGH RISK";
  }

  return "WARNING";

};

export const isExpiringSoon = (
  expiryDate,
  limit = 15
) => {

  const daysLeft =
    calculateDaysLeft(expiryDate);

  return (
    daysLeft !== null &&
    daysLeft >= 0 &&
    daysLeft <= limit
  );

};

export const filterExpiringInventory = (
  inventoryLogs,
  limit = 15
) => {

  return inventoryLogs.filter(item => {

    if (
      !item.expiryDate ||
      item.status === "Consumed"
    ) {
      return false;
    }

    return isExpiringSoon(
      item.expiryDate,
      limit
    );

  });

};