import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/generate", async (req, res) => {
  const prompt = `You are a scheduling AI.\n\nRules:\n- Output valid JSON only\n- No explanations\n- No markdown\n\nSchema:\n{\n  "date": "YYYY-MM-DD",\n  "blocks": [\n    { "start": "HH:MM", "end": "HH:MM", "title": "", "category": "Sleep|Health|Academics|Work|Personal" }\n  ]\n}\n\nUser preferences:\n${JSON.stringify(req.body)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const ollamaResp = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.1",
        prompt,
        // Enforce valid JSON structure and disable streaming
        format: "json",
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!ollamaResp.ok) {
      throw new Error(`Ollama HTTP ${ollamaResp.status}`);
    }

    const payload = await ollamaResp.json();
    // payload.response should be a JSON string when format: 'json'
    const raw = payload.response ?? payload;
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return res.json(data);
  } catch (e) {
    console.error("Ollama error, falling back:", e?.message || e);
    // Fallback deterministic schedule so the UI still responds
    const fallback = buildFallbackSchedule(req.body);
    return res.json(fallback);
  }
});

function buildFallbackSchedule(prefs = {}) {
  const today = new Date();
  const date = today.toISOString().slice(0, 10);
  const wake = typeof prefs.wake_time === "string" ? prefs.wake_time : "08:00";
  const sleepHours = Number(prefs.sleep_hours) || 8;

  const sleepStart = subtractHours(wake, sleepHours);

  const blocks = [
    { start: sleepStart, end: wake, title: "Sleep", category: "Sleep" },
    { start: addMinutes(wake, 0), end: addMinutes(wake, 30), title: "Morning routine", category: "Health" },
    { start: addMinutes(wake, 60), end: addMinutes(wake, 240), title: "Focused work", category: "Work" },
    { start: addMinutes(wake, 240), end: addMinutes(wake, 300), title: "Lunch", category: "Personal" },
    { start: addMinutes(wake, 360), end: addMinutes(wake, 540), title: "Study / Academics", category: "Academics" },
  ];

  return { date, blocks };
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(mins) {
  const m = ((mins % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function addMinutes(hhmm, minutes) {
  return fromMinutes(toMinutes(hhmm) + minutes);
}

function subtractHours(hhmm, hours) {
  return fromMinutes(toMinutes(hhmm) - hours * 60);
}

app.listen(3001, () => {
  console.log("Backend running on port 3001");
});
