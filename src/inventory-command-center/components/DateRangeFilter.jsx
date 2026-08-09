
import React from "react";
import SafeDateInput from "../../shared/components/SafeDateInput.jsx";

const DateRangeFilter = ({
  fromDate,
  toDate,
  setFromDate,
  setToDate
}) => {

  return (

    <>

      <SafeDateInput
        aria-label="Date from"
        value={fromDate}
        onChange={(v) => {
          if (v) setFromDate(v);
        }}
      />

      <SafeDateInput
        aria-label="Date to"
        value={toDate}
        onChange={(v) => {
          if (v) setToDate(v);
        }}
      />

    </>

  );

};

export default DateRangeFilter;
