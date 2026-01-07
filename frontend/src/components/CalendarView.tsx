import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { DailySchedule } from "../types";

export default function CalendarView({ schedule }: { schedule: DailySchedule }) {
  return (
    <div style={cardStyle}>
      <FullCalendar
        plugins={[timeGridPlugin]}
        initialView="timeGridDay"
        allDaySlot={false}
        height="auto"
        events={schedule.blocks.map(b => ({
          title: b.title,
          start: `${schedule.date}T${b.start}`,
          end: `${schedule.date}T${b.end}`,
          backgroundColor: colorMap[b.category],
        }))}
      />
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
};
