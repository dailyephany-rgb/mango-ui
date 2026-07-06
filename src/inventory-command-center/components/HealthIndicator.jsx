
import React from "react";

const HealthIndicator = ({
  percentage = 0
}) => {

  const getHealthClass = () => {

    if (percentage <= 25) {
      return "emergency-badge";
    }

    if (percentage <= 50) {
      return "safe-badge";
    }

    return "safe-badge";

  };

  return (

    <div
      style={{
        width: "100%"
      }}
    >

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "5px"
        }}
      >

        <span>
          Health
        </span>

        <span className={getHealthClass()}>

          {percentage}%

        </span>

      </div>

      <div
        className="progress-bar"
      >

        <div
          className="progress-fill bg-blue-step"
          style={{
            width: `${percentage}%`
          }}
        ></div>

      </div>

    </div>

  );

};

export default HealthIndicator;