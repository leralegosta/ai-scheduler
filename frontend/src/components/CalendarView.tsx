import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { DailySchedule } from "../types";

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function minutesToTimeStr(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad2(h)}:${pad2(m)}:00`;
}
function addDaysToDate(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function CalendarView({ schedule }: { schedule: DailySchedule & { wake_time?: string; bed_time?: string } }) {
  // Use schedule wake/bed if provided, fallback to existing block bounds
  const wake = schedule.wake_time ?? null;
  const bed = schedule.bed_time ?? null;

  let slotMinTime = "07:00:00";
  let slotMaxTime = "22:00:00";
  let wakeMin = 7 * 60;
  let bedMin = 22 * 60;

  if (wake) wakeMin = toMinutes(wake);
  if (bed) bedMin = toMinutes(bed);
  if (bed && bedMin <= wakeMin) bedMin += 24 * 60;

  slotMinTime = minutesToTimeStr(wakeMin);
  slotMaxTime = minutesToTimeStr(bedMin);

  const events = schedule.blocks
    .filter(b => b.category !== "Sleep")
    .map(b => {
      // Map block times to absolute minutes relative to wakeMin timeline
      let s = toMinutes(b.start);
      let e = toMinutes(b.end);
      if (s < wakeMin) s += 24 * 60;
      if (e < wakeMin) e += 24 * 60;
      if (e <= s) e = s + 1; // safety

      const startDate = s >= 24 * 60 ? addDaysToDate(schedule.date, 1) : schedule.date;
      const endDate = e >= 24 * 60 ? addDaysToDate(schedule.date, 1) : schedule.date;
      const startTime = minutesToTimeStr(s % (24 * 60)).slice(0, 8);
      const endTime = minutesToTimeStr(e % (24 * 60)).slice(0, 8);

      return {
        title: b.title,
        start: `${startDate}T${startTime}`,
        end: `${endDate}T${endTime}`,
        backgroundColor: colorMap[b.category],
        textColor: "#000",
      };
    });

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
          events={events}
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
