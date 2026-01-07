import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Simple health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/generate", async (req, res) => {
  console.log("/generate request received", { body: req.body });
  const prompt = `You are a scheduling AI.\n\nRules:\n- Output valid JSON only\n- No explanations\n- No markdown\n\nSchema:\n{\n  \"date\": \"YYYY-MM-DD\",\n  \"blocks\": [\n    { \"start\": \"HH:MM\", \"end\": \"HH:MM\", \"title\": \"\", \"category\": \"Sleep|Health|Academics|Work|Personal\" }\n  ]\n}\n\nConsider user preferences (wake_time, bed_time) and commitments: each commitment has title, category, start, end. Place commitments exactly at provided times; fill remaining time with healthy routines.\n\nInput:\n${JSON.stringify(req.body)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const base = process.env.OLLAMA_URL || "http://localhost:11434";
    const ollamaResp = await fetch(`${base}/api/generate`, {
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
    console.log("/generate success via Ollama");
    return res.json(data);
  } catch (e) {
    console.error("Ollama error, falling back:", e?.message || e);
    // Fallback deterministic schedule so the UI still responds
    const fallback = buildFallbackSchedule(req.body);
    console.log("/generate responded with fallback");
    return res.json(fallback);
  }
});

function buildFallbackSchedule(prefs = {}) {
  const today = new Date();
  const date = today.toISOString().slice(0, 10);
  const wake = typeof prefs.wake_time === "string" ? prefs.wake_time : "08:00";
  const bed = typeof prefs.bed_time === "string" ? prefs.bed_time : null;
  const commitments = Array.isArray(prefs.commitments) ? prefs.commitments : [];

  const blocks = [];

  // Sleep block: prefer bed->wake if it doesn't cross midnight; else default to 8h before wake
  if (bed && toMinutes(bed) <= toMinutes(wake)) {
    blocks.push({ start: bed, end: wake, title: "Sleep", category: "Sleep" });
  } else {
    blocks.push({ start: subtractHours(wake, 8), end: wake, title: "Sleep", category: "Sleep" });
  }

  // Morning routine
  blocks.push({ start: addMinutes(wake, 0), end: addMinutes(wake, 30), title: "Morning routine", category: "Health" });

  // User commitments: placed exactly at specified times
  for (const c of commitments) {
    if (c && typeof c.start === "string" && typeof c.end === "string") {
      blocks.push({ start: c.start, end: c.end, title: c.title || "Commitment", category: c.category || "Work" });
    }
  }

  // A couple of filler blocks
  blocks.push({ start: addMinutes(wake, 60), end: addMinutes(wake, 240), title: "Focused work", category: "Work" });
  blocks.push({ start: addMinutes(wake, 240), end: addMinutes(wake, 300), title: "Lunch", category: "Personal" });

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
