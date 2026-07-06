
import React from "react";

const DepartmentFilter = ({
  value,
  onChange
}) => {

  return (

    <select
      value={value}
      onChange={(e) =>
        onChange(e.target.value)
      }
    >

      <option value="All">
        All
      </option>

      <option value="Serology">
        Serology
      </option>

      <option value="Rapid Card">
        Rapid Card
      </option>

      <option value="Urine">
        Urine
      </option>

    </select>

  );

};

export default DepartmentFilter;