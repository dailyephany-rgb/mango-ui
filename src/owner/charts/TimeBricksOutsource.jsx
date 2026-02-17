
import React, { useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import resourceTimelinePlugin from "@fullcalendar/resource-timeline";
import interactionPlugin from "@fullcalendar/interaction";
import moment from "moment";
import "./TimeBricksOutsource.css";

export default function TimeBricks({ unifiedRows, testTimings = {}, onBrickClick, fromDate, toDate, department = "STERLING" }) {
  
  const { calendarKey, startStr, endStr, initialDate } = useMemo(() => {
    const start = fromDate ? moment(fromDate).startOf('day') : moment().startOf('month');
    const end = toDate ? moment(toDate).endOf('day') : moment().endOf('month');
    const sStr = start.format("YYYY-MM-DD");
    const eStr = end.clone().add(1, 'days').format("YYYY-MM-DD");

    return {
      calendarKey: `fc-${sStr}-${eStr}-${department}`,
      startStr: sStr,
      endStr: eStr,
      initialDate: sStr
    };
  }, [fromDate, toDate, department]);

  const resources = useMemo(() => {
    const uniqueRegs = Array.from(new Set(unifiedRows.map(r => r.regNo)));
    return uniqueRegs.map(regNo => ({ id: regNo, title: regNo }));
  }, [unifiedRows]);

  const events = useMemo(() => {
    const labKey = Object.keys(testTimings).find(k => k.toLowerCase() === department.toLowerCase());
    const labConfig = labKey ? testTimings[labKey] : null;
    const activeLimit = labConfig ? (labConfig.collected_to_saved || 1440) : 1440;

    return unifiedRows
      .filter(r => r.timeScanned && r.timeSaved)
      .map((r, index) => {
        const start = moment(r.timeScanned);
        const end = moment(r.timeSaved);
        const diffMinutes = Math.round((end - start) / 60000);
        const isViolated = diffMinutes > activeLimit;

        // Logic for "Xd Xh" or "Xh Xm" title format
        let displayTitle = "";
        if (diffMinutes >= 1440) {
          const days = Math.floor(diffMinutes / 1440);
          const hours = Math.round((diffMinutes % 1440) / 60);
          displayTitle = hours > 0 ? `${days}d ${hours}h` : `${days}d`;
        } else if (diffMinutes >= 60) {
          const hours = Math.floor(diffMinutes / 60);
          const mins = diffMinutes % 60;
          displayTitle = mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
        } else {
          displayTitle = `${diffMinutes}m`;
        }

        return {
          id: `${r.regNo}-${index}`,
          resourceId: r.regNo,
          start: start.format(),
          end: end.format(),
          title: displayTitle,
          backgroundColor: isViolated ? "rgba(255, 59, 48, 0.15)" : "rgba(52, 199, 89, 0.15)",
          borderColor: isViolated ? "#ff3b30" : "#34c759",
          textColor: isViolated ? "#ff3b30" : "#34c759",
          display: 'block', 
          extendedProps: { fullData: r }
        };
      });
  }, [unifiedRows, testTimings, department]);

  return (
    <div className="fullcalendar-outsource-container">
      <FullCalendar
        key={calendarKey} 
        plugins={[resourceTimelinePlugin, interactionPlugin]}
        initialView="resourceTimeline"
        initialDate={initialDate} 
        headerToolbar={false}
        resources={resources}
        events={events}
        resourceAreaWidth="150px"
        resourceAreaHeaderContent="Reg No"

        resourceAreaHeaderDidMount={(info) => {
          const el = info.el;
          el.style.setProperty('background-color', '#000080', 'important');
          el.style.setProperty('color', '#ffffff', 'important');
          const cushion = el.querySelector('.fc-datagrid-cell-cushion');
          if (cushion) cushion.style.setProperty('color', '#ffffff', 'important');
        }}

        resourceLabelDidMount={(info) => {
          const el = info.el;
          if (el.classList.contains('fc-resource-area-header-cell')) {
            el.style.setProperty('background-color', '#000080', 'important');
            el.style.setProperty('color', '#ffffff', 'important');
            const cushion = el.querySelector('.fc-datagrid-cell-cushion');
            if (cushion) cushion.style.setProperty('color', '#ffffff', 'important');
          }
        }}

        slotLabelDidMount={(info) => {
          info.el.style.setProperty('background-color', '#000080', 'important');
          info.el.style.setProperty('color', '#ffffff', 'important');
          const cushion = info.el.querySelector('.fc-timeline-slot-cushion');
          if (cushion) cushion.style.setProperty('color', '#ffffff', 'important');
        }}

        height="600px"
        slotMinWidth={100}
        visibleRange={{ start: startStr, end: endStr }}
        slotDuration={{ days: 1 }}
        snapDuration={{ hours: 1 }}
        slotLabelFormat={[{ day: '2-digit', month: 'short' }]}
        displayEventTime={false} 
        eventClick={(info) => onBrickClick(info.event.extendedProps.fullData)}
        resourceOrder="title"
        schedulerLicenseKey="CC-Attribution-NonCommercial-NoDerivatives"
      />
    </div>
  );
}