import { useState } from "react";
import type { DailySchedule } from "../types";

type Props = {
  onGenerate: (schedule: DailySchedule) => void;
};

export default function InputForm({ onGenerate }: Props) {
  const [sleep, setSleep] = useState(9);
  const [wake, setWake] = useState("08:00");
  const [bed, setBed] = useState("23:00");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateSchedule() {
    setError(null);
    setLoading(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch("http://localhost:3001/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sleep_hours: sleep,
          wake_time: wake,
          bed_time: bed,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }

      const data = await res.json();
      onGenerate(data);
    } catch (e) {
      console.error(e);
      const msg = (e as any)?.name === "AbortError" ? "Request timed out." : "Failed to generate schedule. Backend may be offline.";
      setError(msg);
    } finally {
      // Ensure we clear the timeout even on success
      // @ts-ignore - timeout type differs across environments
      clearTimeout(timeout);
      setLoading(false);
    }
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

      <button onClick={generateSchedule} disabled={loading}>
        {loading ? "Generating…" : "Generate Schedule"}
      </button>
      {error && <div style={{ color: "crimson" }}>{error}</div>}
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
