import React from "react";

// define the Commitment type
export type Commitment = {
  title: string;
  category: "Academics" | "Work";
  start: string; // HH:MM
  end: string;   // HH:MM
};

// define the Props type for CommitmentsForm
type Props = {
  commitments: Commitment[];
  onChange: (next: Commitment[]) => void;
};

// CommitmentsForm component
export default function CommitmentsForm({ commitments, onChange }: Props) {
  function update(index: number, patch: Partial<Commitment>) {
    const next = commitments.slice();
    next[index] = { ...next[index], ...patch } as Commitment;
    onChange(next);
  }

  // add a new commitment
  function add() {
    onChange([...commitments, { title: "", category: "Academics", start: "09:00", end: "10:00" }]);
  }

  // remove a commitment at a specific index
  function remove(index: number) {
    const next = commitments.slice();
    next.splice(index, 1);
    onChange(next);
  }

  // render the component
  return (
    <div style={container}>
      <h3 style={{ margin: 0, fontSize: 18, color: "#1f1f29" }}>Commitments</h3>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Add class or work times you must attend.</p>
      {commitments.map((c, i) => (
        <div key={i} style={row}>
          <input style={input} placeholder="Title" value={c.title} onChange={e => update(i, { title: e.target.value })} />
          <select style={select} value={c.category} onChange={e => update(i, { category: e.target.value as Commitment["category"] })}>
            <option value="Academics">Academics</option>
            <option value="Work">Work</option>
          </select>
          <input style={input} type="time" value={c.start} onChange={e => update(i, { start: e.target.value })} />
          <span style={{ color: "#666" }}>to</span>
          <input style={input} type="time" value={c.end} onChange={e => update(i, { end: e.target.value })} />
          <button type="button" style={removeBtn} onClick={() => remove(i)}>Remove</button>
        </div>
      ))}
      <button type="button" style={addBtn} onClick={add}>Add Commitment</button>
    </div>
  );
}

// styles
const container: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const row: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.2fr 0.8fr 0.9fr auto 0.9fr auto",
  alignItems: "center",
  gap: 8,
};

const input: React.CSSProperties = {
  padding: "0.5rem 0.6rem",
  borderRadius: 10,
  border: "1px solid #ddd",
  fontSize: 14,
};

const select: React.CSSProperties = {
  padding: "0.5rem 0.6rem",
  borderRadius: 10,
  border: "1px solid #ddd",
  fontSize: 14,
};

const addBtn: React.CSSProperties = {
  padding: "0.45rem 0.7rem",
  borderRadius: 10,
  border: "none",
  background: "var(--secondary)",
  color: "#1f1f29",
  fontWeight: 600,
  cursor: "pointer",
  width: "fit-content",
};

const removeBtn: React.CSSProperties = {
  padding: "0.4rem 0.6rem",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fafafa",
  color: "#333",
  cursor: "pointer",
};
