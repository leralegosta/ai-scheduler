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

  // Determine window to show: wake -> bed (bed may be after midnight)
  const wakeMin = toMinutes(wake);
  let bedMin = bed ? toMinutes(bed) : wakeMin + 15 * 60; // default 15 hours awake window
  if (bed && bedMin <= wakeMin) bedMin += 24 * 60;

  // Normalize commitments and keep only those that intersect the wake->bed window
  const normCommitments = [];
  for (const c of commitments) {
    if (c && typeof c.start === "string" && typeof c.end === "string") {
      let s = toMinutes(c.start);
      let e = toMinutes(c.end);
      if (e <= s) e += 24 * 60;
      // if commitment intersects window, clip it to the window
      if (e <= wakeMin || s >= bedMin) continue;
      s = Math.max(s, wakeMin);
      e = Math.min(e, bedMin);
      normCommitments.push({ start: s, end: e, title: c.title || "Commitment", category: c.category || "Work" });
    }
  }
  normCommitments.sort((a, b) => a.start - b.start);

  // Build gaps between wakeMin and bedMin excluding commitments
  const gaps = [];
  let cursor = wakeMin;
  for (const cc of normCommitments) {
    if (cc.start > cursor) gaps.push({ start: cursor, end: cc.start });
    cursor = Math.max(cursor, cc.end);
  }
  if (cursor < bedMin) gaps.push({ start: cursor, end: bedMin });

  // Add commitments as fixed blocks (converted back to HH:MM mod 24)
  for (const cc of normCommitments) {
    blocks.push({ start: fromMinutes(cc.start), end: fromMinutes(cc.end), title: cc.title, category: cc.category });
  }

  // Desired filler blocks sequence (durations in minutes)
  const hobbyText = typeof prefs.hobby === "string" && prefs.hobby.trim() ? prefs.hobby.trim() : null;
  const desired = [
    { title: "Breakfast", dur: 30, category: "Personal" },
    { title: "Morning routine", dur: 30, category: "Health" },
    { title: "Focused work", dur: 180, category: "Work" },
    { title: "Lunch", dur: 60, category: "Personal" },
    { title: "Afternoon work", dur: 180, category: "Work" },
    { title: "Chores", dur: 45, category: "Personal" },
    { title: "Dinner", dur: 45, category: "Personal" },
  ];
  if (hobbyText) desired.push({ title: `Hobby: ${hobbyText}`, dur: 60, category: "Personal" });

  // Fill each gap by placing desired blocks in order, allowing truncation to fit
  let desiredIdx = 0;
  for (const gap of gaps) {
    let pos = gap.start;
    let remaining = gap.end - pos;
    while (remaining > 10) {
      const d = desired[desiredIdx % desired.length];
      const placeDur = Math.min(d.dur, remaining);
      blocks.push({ start: fromMinutes(pos), end: fromMinutes(pos + placeDur), title: d.title, category: d.category });
      pos += placeDur;
      remaining = gap.end - pos;
      desiredIdx += 1;
    }
    if (remaining > 0 && remaining <= 10) {
      // small leftover -> mark as Free time
      blocks.push({ start: fromMinutes(gap.end - remaining), end: fromMinutes(gap.end), title: "Free time", category: "Personal" });
    }
  }

  // Sort blocks by start time for display
  blocks.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

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
