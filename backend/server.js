import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.post("/generate", async (req, res) => {
  console.log("/generate request received", { body: req.body });
  const prompt = `You are a scheduling AI.\n\nRules:\n- Output valid JSON only\n- No explanations\n- No markdown\n\nSchema:\n{\n  \"date\": \"YYYY-MM-DD\",\n  \"blocks\": [\n    { \"start\": \"HH:MM\", \"end\": \"HH:MM\", \"title\": \"\", \"category\": \"Sleep|Health|Academics|Work|Personal\" }\n  ]\n}\n\nInput:\n${JSON.stringify(req.body)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const base = process.env.OLLAMA_URL || "http://localhost:11434";
    const resp = await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "llama3.1", prompt, format: "json", stream: false }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}`);
    const payload = await resp.json();
    console.log("Ollama response:", payload);
    const raw = payload.response ?? payload;
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    console.log("/generate success via Ollama");
    console.log("Generated schedule:", data);
    return res.json(data);
  } catch (err) {
    console.error("Ollama error, falling back:", err?.message || err);
    const fallback = buildFallbackSchedule(req.body);
    console.log("Generated fallback schedule:", fallback);
    console.log("/generate responded with fallback");
    return res.json(fallback);
  }
});

function buildFallbackSchedule(prefs = {}) {
  function toMinutes(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }
  function fromMinutes(mins) {
    const m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  const today = new Date();
  const date = today.toISOString().slice(0, 10);
  const wake = typeof prefs.wake_time === "string" ? prefs.wake_time : "08:00";
  const bed = typeof prefs.bed_time === "string" ? prefs.bed_time : null;
  const hobbyText = typeof prefs.hobby === "string" ? prefs.hobby.trim() : null;
  const commitments = Array.isArray(prefs.commitments) ? prefs.commitments : [];

  const wakeMin = toMinutes(wake);
  let bedMin = bed ? toMinutes(bed) : wakeMin + 15 * 60;
  if (bed && bedMin <= wakeMin) bedMin += 24 * 60;

  const normCommitments = [];
  for (const c of commitments) {
    if (!c || typeof c.start !== "string" || typeof c.end !== "string") continue;
    let s = toMinutes(c.start);
    let e = toMinutes(c.end);
    if (e <= s) e += 24 * 60;
    if (e <= wakeMin || s >= bedMin) continue;
    s = Math.max(s, wakeMin);
    e = Math.min(e, bedMin);
    normCommitments.push({ start: s, end: e, title: c.title || "Commitment", category: c.category || "Work" });
  }
  normCommitments.sort((a, b) => a.start - b.start);

  const gaps = [];
  let cursor = wakeMin;
  for (const cc of normCommitments) {
    if (cc.start > cursor) gaps.push({ start: cursor, end: cc.start });
    cursor = Math.max(cursor, cc.end);
  }
  if (cursor < bedMin) gaps.push({ start: cursor, end: bedMin });

  const blocks = [];
  for (const cc of normCommitments) blocks.push({ start: fromMinutes(cc.start), end: fromMinutes(cc.end), title: cc.title, category: cc.category });

  // hobby window detection
  let hobbyWindow = null;
  if (hobbyText) {
    const lower = hobbyText.toLowerCase();
    if (lower.includes("morning")) hobbyWindow = { earliest: 6 * 60, latest: 11 * 60 };
    else if (lower.includes("afternoon")) hobbyWindow = { earliest: 12 * 60, latest: 17 * 60 };
    else if (lower.includes("evening") || lower.includes("night")) hobbyWindow = { earliest: 17 * 60, latest: 23 * 60 };
    const m = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
    if (m) {
      let hr = parseInt(m[1], 10);
      const mn = m[2] ? parseInt(m[2], 10) : 0;
      const ampm = m[3];
      if (ampm === "pm" && hr < 12) hr += 12;
      if (ampm === "am" && hr === 12) hr = 0;
      const t = hr * 60 + mn;
      hobbyWindow = { earliest: Math.max(0, t - 60), latest: Math.min(24 * 60, t + 60) };
    }
    if (hobbyWindow) {
      hobbyWindow.earliest = Math.max(hobbyWindow.earliest, wakeMin);
      hobbyWindow.latest = Math.min(hobbyWindow.latest, bedMin);
      if (hobbyWindow.latest <= hobbyWindow.earliest) hobbyWindow = null;
    }
  }

  const used = { breakfast: false, morning: false, lunch: false, dinner: false, chores: false, hobby: false };

  for (const gap of gaps) {
    let pos = gap.start;
    while (pos < gap.end) {
      const remaining = gap.end - pos;
      // hobby
      if (hobbyWindow && !used.hobby && pos >= hobbyWindow.earliest && pos < hobbyWindow.latest) {
        const dur = Math.min(60, remaining);
        blocks.push({ start: fromMinutes(pos), end: fromMinutes(pos + dur), title: `Hobby: ${hobbyText}`, category: "Personal" });
        used.hobby = true;
        pos += dur;
        continue;
      }
      // breakfast
      if (!used.breakfast && pos < 11 * 60 && remaining >= 20) {
        const dur = Math.min(30, remaining);
        blocks.push({ start: fromMinutes(pos), end: fromMinutes(pos + dur), title: "Breakfast", category: "Personal" });
        used.breakfast = true;
        pos += dur;
        continue;
      }
      // morning routine
      if (!used.morning && pos < 11 * 60 && remaining >= 15) {
        const dur = Math.min(30, remaining);
        blocks.push({ start: fromMinutes(pos), end: fromMinutes(pos + dur), title: "Morning routine", category: "Health" });
        used.morning = true;
        pos += dur;
        continue;
      }
      // lunch
      if (!used.lunch && pos >= 11 * 60 && pos < 14 * 60 && remaining >= 30) {
        const dur = Math.min(60, remaining);
        blocks.push({ start: fromMinutes(pos), end: fromMinutes(pos + dur), title: "Lunch", category: "Personal" });
        used.lunch = true;
        pos += dur;
        continue;
      }
      // dinner
      if (!used.dinner && pos >= 17 * 60 && remaining >= 30) {
        const dur = Math.min(45, remaining);
        blocks.push({ start: fromMinutes(pos), end: fromMinutes(pos + dur), title: "Dinner", category: "Personal" });
        used.dinner = true;
        pos += dur;
        continue;
      }
      // chores
      if (!used.chores && pos >= 16 * 60 && remaining >= 20) {
        const dur = Math.min(45, remaining);
        blocks.push({ start: fromMinutes(pos), end: fromMinutes(pos + dur), title: "Chores", category: "Personal" });
        used.chores = true;
        pos += dur;
        continue;
      }
      // focused / work
      const isAfternoon = pos >= 12 * 60 && pos < 18 * 60;
      const workDur = Math.min(isAfternoon ? 180 : 60, remaining);
      blocks.push({ start: fromMinutes(pos), end: fromMinutes(pos + workDur), title: isAfternoon ? "Afternoon work" : "Focused work", category: "Work" });
      pos += workDur;
    }
  }

  blocks.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  return { date, blocks };
}

app.listen(3001, () => console.log("Backend running on port 3001"));
