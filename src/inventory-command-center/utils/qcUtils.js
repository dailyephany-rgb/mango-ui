
export const formatQCStatus = (
  status
) => {

  if (!status) {
    return "-";
  }

  return status;

};

export const isQCFailure = (
  status
) => {

  if (!status) {
    return false;
  }

  const value =
    status.toString().trim().toUpperCase();

  return (
    value === "FAIL" ||
    value === "FAILURE" ||
    value === "FAILED"
  );

};



export const groupQCByDepartment = (
  logs
) => {

  const grouped = {};

  logs.forEach(log => {

    const department =
      log.department || "Unknown";

    if (!grouped[department]) {

      grouped[department] = [];

    }

    grouped[department].push(log);

  });

  return grouped;

};

export const calculateQCFailureCount = (
  logs
) => {

  return logs.filter(log =>
    isQCFailure(log.result)
  ).length;

};
