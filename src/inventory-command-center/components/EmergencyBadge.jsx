
import React from "react";

const EmergencyBadge = ({
  isEmergency,
  emergencyText = "EMERGENCY",
  safeText = "SAFE"
}) => {

  return (

    <span
      className={
        isEmergency
          ? "emergency-badge"
          : "safe-badge"
      }
    >

      {
        isEmergency
          ? emergencyText
          : safeText
      }

    </span>

  );

};

export default EmergencyBadge;