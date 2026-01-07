import InputForm from "./components/InputForm";
import CalendarView from "./components/CalendarView";
import { useState } from "react";
import { DailySchedule } from "./types";

export default function App() {
  const [schedule, setSchedule] = useState<DailySchedule | null>(null);

  return (
    <div style={{ padding: "2rem", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontWeight: 600 }}>AI Daily Schedule</h1>
      <InputForm onGenerate={setSchedule} />
      {schedule && <CalendarView schedule={schedule} />}
    </div>
  );
}
