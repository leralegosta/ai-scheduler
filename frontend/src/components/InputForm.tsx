import { useState } from "react";
import { DailySchedule } from "../types";

type Props = {
  onGenerate: (schedule: DailySchedule) => void;
};

export default function InputForm({ onGenerate }: Props) {
  const [sleep, setSleep] = useState(9);
  const [wake, setWake] = useState("08:00");
  const [bed, setBed] = useState("23:00");

  async function generateSchedule() {
    const res = await fetch("http://localhost:3001/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sleep_hours: sleep,
        wake_time: wake,
        bed_time: bed,
      }),
    });

    const data = await res.json();
    onGenerate(data);
  }

  return (
    <div style={cardStyle}>
      <h3>Preferences</h3>

      <label>
        Sleep hours
        <input type="number" value={sleep} onChange={e => setSleep(+e.target.value)} />
      </label>

      <label>
        Wake time
        <input type="time" value={wake} onChange={e => setWake(e.target.value)} />
      </label>

      <label>
        Bedtime
        <input type="time" value={bed} onChange={e => setBed(e.target.value)} />
      </label>

      <button onClick={generateSchedule}>Generate Schedule</button>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--card)",
  padding: "1.5rem",
  borderRadius: 16,
  boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
  marginBottom: "2rem",
  display: "grid",
  gap: "0.75rem",
};
