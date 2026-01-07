import { useState } from "react";
import type { DailySchedule } from "../types";
import CommitmentsForm from "./CommitmentsForm";
import type { Commitment } from "./CommitmentsForm";

type Props = {
  onGenerate: (schedule: DailySchedule) => void;
};

export default function InputForm({ onGenerate }: Props) {
  const [wake, setWake] = useState("08:00");
  const [bed, setBed] = useState("23:00");
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateSchedule() {
    setError(null);
    setLoading(true);
    const controller = new AbortController();
    const timeoutId: number = window.setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch("http://localhost:3001/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wake_time: wake,
          bed_time: bed,
          commitments,
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
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ margin: 0, fontSize: 24, color: "#1f1f29" }}>Preferences</h2>

      <label style={labelStyle}>
        Wake time
        <input style={inputStyle} type="time" value={wake} onChange={e => setWake(e.target.value)} />
      </label>

      <label style={labelStyle}>
        Bedtime
        <input style={inputStyle} type="time" value={bed} onChange={e => setBed(e.target.value)} />
      </label>

      <CommitmentsForm commitments={commitments} onChange={setCommitments} />

      <button onClick={generateSchedule} disabled={loading} style={buttonStyle}>
        {loading ? "Generating…" : "Generate Schedule"}
      </button>
      {error && <div style={{ color: "crimson", fontSize: 14 }}>{error}</div>}
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
  gap: "0.9rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: 16,
  color: "#2a2a36",
  display: "grid",
  gap: 6,
};

const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.6rem",
  borderRadius: 10,
  border: "1px solid #ddd",
  fontSize: 15,
};

const buttonStyle: React.CSSProperties = {
  padding: "0.6rem 0.8rem",
  borderRadius: 10,
  border: "none",
  background: "var(--primary)",
  color: "#1f1f29",
  fontWeight: 600,
  cursor: "pointer",
};
