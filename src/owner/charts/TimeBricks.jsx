
import React, { useMemo, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import resourceTimelinePlugin from "@fullcalendar/resource-timeline";
import moment from "moment";
import "./TimeBricks.css"; 

export default function TimeBricks({
  unifiedRows,
  testTimings = {},
  onBrickClick,
  department = "biochemistry",
  search = "",
})
{
  
  const REF_DAY = moment().format("YYYY-MM-DD");
  const SLOT_WIDTH = 200; 
  const filteredRows = useMemo(() => {
    const query =
      search.trim().toLowerCase();
  
    if (!query) {
      return unifiedRows;
    }
  
    return unifiedRows.filter((r) => {
      const regNo = String(
        r.regNo || ""
      ).toLowerCase();
  
      const diagNo = String(
        r.diagnosticNo || ""
      ).toLowerCase();
  
      return (
        regNo.includes(query) ||
        diagNo.includes(query)
      );
    });
  }, [unifiedRows, search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      console.log(
        `%c --- HEADER STYLE DIAGNOSIS --- `,
        "background: #000080; color: #fff; font-weight: bold;"
      );
  
      const timeLabels =
        document.querySelectorAll(
          ".fc-timeline-slot-label-cushion"
        );
  
      const diagHeader =
        document.querySelector(
          ".fc-datagrid-header .fc-datagrid-cell-cushion"
        );
  
      if (timeLabels.length > 0) {
        const firstLabel =
          timeLabels[0];
  
        console.log(
          "Time Label Text:",
          firstLabel.innerText
        );
      }
  
      if (diagHeader) {
        const style =
          window.getComputedStyle(
            diagHeader
          );
  
        console.log(
          "Diag No Align:",
          style.justifyContent,
          style.alignItems
        );
      }
    }, 2500);
  
    return () =>
      clearTimeout(timer);
  }, [filteredRows]);

  const events = useMemo(() => {
    const deptTimings = testTimings[department] || {};
    const allowedLimit = deptTimings["scanned_to_saved"] || 30;

    return filteredRows
      .filter((r) => r.timeScanned && r.timeSaved)
      .map((r, index) => {
        const rawStart = r.timeScanned?.toDate ? r.timeScanned.toDate() : new Date(r.timeScanned);
        const rawEnd = r.timeSaved?.toDate ? r.timeSaved.toDate() : new Date(r.timeSaved);
        const start = moment(REF_DAY).set({ hour: rawStart.getHours(), minute: rawStart.getMinutes(), second: rawStart.getSeconds(), millisecond: 0 }).toDate();
        let end = moment(REF_DAY).set({ hour: rawEnd.getHours(), minute: rawEnd.getMinutes(), second: rawEnd.getSeconds(), millisecond: 0 }).toDate();
        if (moment(end).isBefore(start)) end = moment(end).add(1, 'days').toDate();
        const duration = Math.round((rawEnd - rawStart) / 60000);


        return {
          // UPDATED: resourceId now uses diagnosticNo
          id: `${r.diagnosticNo}-${index}`,
          resourceId: r.diagnosticNo,
          start: start, 
          end: end,
          title: `${duration}m`,
          backgroundColor: duration > allowedLimit ? "#ff3b30" : "#34c759",
          textColor: "#ffffff",
          extendedProps: { fullData: r } 
        };
      });
    }, [
      filteredRows,
      testTimings,
      department,
      REF_DAY,
    ]);

    const resources = useMemo(
      () =>
        Array.from(
          new Set(
            filteredRows.map(
              (r) => r.diagnosticNo
            )
          )
        ).map((id) => ({
          id,
          title: id,
        })),
      [filteredRows]
    );

  return (
    <div className="timebricks-fc-container">
      <FullCalendar
        plugins={[resourceTimelinePlugin]}
        initialView="resourceTimelineDay"
        resources={resources}
        initialDate={REF_DAY}
        events={events}
        height="700px" 
        resourceAreaWidth="180px"
        headerToolbar={false}
        slotDuration="01:00:00"
        slotMinWidth={SLOT_WIDTH}
        
        slotLabelContent={(arg) => {
          return { html: `<div class="custom-slot-label">${moment(arg.date).format("h A")}</div>` };
        }}

        snapDuration="00:00:01" 
        eventOrderStrict={true}
        // UPDATED: Label changed to DIAGNOSTIC NO
        resourceAreaHeaderContent="DIAGNOSTIC NO"
        eventClick={(info) => onBrickClick(info.event.extendedProps.fullData)}
      />
    </div>
  );
}