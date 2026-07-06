
import React from "react";

const CommandCenterHeader = ({
  title,
  subtitle = ""
}) => {

  return (

    <div className="command-center-header">

      <div>

        <h1>{title}</h1>

        {

          subtitle && (

            <p
              style={{
                color: "#94a3b8",
                marginTop: "4px"
              }}
            >

              {subtitle}

            </p>

          )

        }

      </div>

    </div>

  );

};

export default CommandCenterHeader;