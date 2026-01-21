import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { DailySchedule } from "../types";

export default function CalendarView({ schedule }: { schedule: DailySchedule }) {
  // Hide Sleep blocks visually and restrict visible hours to earliest->latest non-sleep blocks
  const nonSleep = schedule.blocks.filter(b => b.category !== "Sleep");
  const starts = nonSleep.map(b => b.start);
  const ends = nonSleep.map(b => b.end);
  const minStart = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : "07:00";
  const maxEnd = ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : "22:00";

  // FullCalendar expects slotMinTime/slotMaxTime like "08:00:00"
  const slotMinTime = `${minStart}:00`;
  const slotMaxTime = `${maxEnd}:00`;

  return (
    <div style={cardStyle}>
      <div className="calendar-root" style={{ width: "100%" }}>
      <FullCalendar
        plugins={[timeGridPlugin]}
        initialView="timeGridDay"
        allDaySlot={false}
        height="auto"
        slotMinTime={slotMinTime}
        slotMaxTime={slotMaxTime}
        initialScrollTime={slotMinTime}
        events={schedule.blocks
          .filter(b => b.category !== "Sleep")
          .map(b => ({
            title: b.title,
            start: `${schedule.date}T${b.start}`,
            end: `${schedule.date}T${b.end}`,
            backgroundColor: colorMap[b.category],
            textColor: "#000",
          }))}
      />
      </div>
    </div>
  );
}

const colorMap: Record<string, string> = {
  Sleep: "#e6ddff",
  Health: "#d7f2ea",
  Academics: "#fff1cc",
  Work: "#ffd6e0",
  Personal: "#eaeaea",
};

const cardStyle: React.CSSProperties = {
  background: "var(--card)",
  padding: "1rem",
  borderRadius: 16,
  width: "100%",
  textAlign: "left",
};
