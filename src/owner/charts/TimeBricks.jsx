
import React, { useMemo, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import resourceTimelinePlugin from "@fullcalendar/resource-timeline";
import moment from "moment";
import "./TimeBricks.css"; 

export default function TimeBricks({ unifiedRows, testTimings = {}, onBrickClick, department = "haem" }) {
  
  const REF_DAY = moment().format("YYYY-MM-DD");
  const SLOT_WIDTH = 200; 

  // --- DEBUGGING: Logs Header Styles to Console ---
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log(`%c --- HEADER STYLE DIAGNOSIS --- `, 'background: #000080; color: #fff; font-weight: bold;');
      
      const timeLabels = document.querySelectorAll('.fc-timeline-slot-label-cushion');
      const regNoHeader = document.querySelector('.fc-datagrid-header .fc-datagrid-cell-cushion');

      if (timeLabels.length > 0) {
        const firstLabel = timeLabels[0];
        const style = window.getComputedStyle(firstLabel);
        console.log("Time Label Text:", firstLabel.innerText);
        console.log("Time Label Display:", style.display);
        console.log("Time Label AlignItems:", style.alignItems);
        console.log("Time Label TextTransform:", style.textTransform);
        console.log("Time Label HTML Structure:", firstLabel.outerHTML);
      } else {
        console.warn("Could not find Time Labels in DOM. Check if .fc-timeline-slot-label-cushion exists.");
      }

      if (regNoHeader) {
        const style = window.getComputedStyle(regNoHeader);
        console.log("Reg No Align:", style.justifyContent, style.alignItems);
      }
    }, 2500); // Delay to ensure FC is fully rendered

    return () => clearTimeout(timer);
  }, [unifiedRows]);

  const events = useMemo(() => {
    const deptTimings = testTimings[department] || {};
    const allowedLimit = deptTimings["scanned_to_saved"] || 30;

    return unifiedRows
      .filter((r) => r.timeScanned && r.timeSaved)
      .map((r, index) => {
        const rawStart = r.timeScanned?.toDate ? r.timeScanned.toDate() : new Date(r.timeScanned);
        const rawEnd = r.timeSaved?.toDate ? r.timeSaved.toDate() : new Date(r.timeSaved);
        const start = moment(REF_DAY).set({ hour: rawStart.getHours(), minute: rawStart.getMinutes(), second: rawStart.getSeconds(), millisecond: 0 }).toDate();
        let end = moment(REF_DAY).set({ hour: rawEnd.getHours(), minute: rawEnd.getMinutes(), second: rawEnd.getSeconds(), millisecond: 0 }).toDate();
        if (moment(end).isBefore(start)) end = moment(end).add(1, 'days').toDate();
        const duration = Math.round((rawEnd - rawStart) / 60000);

        return {
          id: `${r.regNo}-${index}`,
          resourceId: r.regNo,
          start: start, 
          end: end,
          title: `${duration}m`,
          backgroundColor: duration > allowedLimit ? "#ff3b30" : "#34c759",
          textColor: "#ffffff",
          extendedProps: { fullData: r } 
        };
      });
  }, [unifiedRows, testTimings, department, REF_DAY]);

  return (
    <div className="timebricks-fc-container">
      <FullCalendar
        plugins={[resourceTimelinePlugin]}
        initialView="resourceTimelineDay"
        initialDate={REF_DAY}
        resources={useMemo(() => Array.from(new Set(unifiedRows.map(r => r.regNo))).map(id => ({ id, title: id })), [unifiedRows])}
        events={events}
        height="700px" 
        resourceAreaWidth="160px"
        headerToolbar={false}
        slotDuration="01:00:00"
        slotMinWidth={SLOT_WIDTH}
        
        /* JS-level force for CAPS and SPACE */
        slotLabelContent={(arg) => {
          return { html: `<div class="custom-slot-label">${moment(arg.date).format("h A")}</div>` };
        }}

        snapDuration="00:00:01" 
        eventOrderStrict={true}
        resourceAreaHeaderContent="REG NO"
        eventClick={(info) => onBrickClick(info.event.extendedProps.fullData)}
      />
    </div>
  );
}