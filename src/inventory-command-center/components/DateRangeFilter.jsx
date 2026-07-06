
import React from "react";

const DateRangeFilter = ({
  fromDate,
  toDate,
  setFromDate,
  setToDate
}) => {

  return (

    <>

      <input
        type="date"
        value={fromDate}
        onChange={(e) =>
          setFromDate(e.target.value)
        }
      />

      <input
        type="date"
        value={toDate}
        onChange={(e) =>
          setToDate(e.target.value)
        }
      />

    </>

  );

};

export default DateRangeFilter;
