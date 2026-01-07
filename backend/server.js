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

  // Desired filler blocks with preferred time windows (minutes from 00:00)
  const hobbyText = typeof prefs.hobby === "string" && prefs.hobby.trim() ? prefs.hobby.trim() : null;
  const desired = [
    { key: "breakfast", title: "Breakfast", dur: 30, category: "Personal", earliest: 5 * 60, latest: 11 * 60, max: 1 },
    { key: "morning", title: "Morning routine", dur: 30, category: "Health", earliest: 5 * 60, latest: 10 * 60, max: 1 },
    { key: "focused", title: "Focused work", dur: 180, category: "Work", earliest: 8 * 60, latest: 18 * 60, max: 10 },
    { key: "lunch", title: "Lunch", dur: 60, category: "Personal", earliest: 11 * 60, latest: 14 * 60, max: 1 },
    { key: "afternoon", title: "Afternoon work", dur: 180, category: "Work", earliest: 12 * 60, latest: 20 * 60, max: 10 },
    { key: "chores", title: "Chores", dur: 45, category: "Personal", earliest: 16 * 60, latest: 21 * 60, max: 1 },
    { key: "dinner", title: "Dinner", dur: 45, category: "Personal", earliest: 17 * 60, latest: 22 * 60, max: 1 },
  ];
  if (hobbyText) desired.push({ key: "hobby", title: `Hobby: ${hobbyText}`, dur: 60, category: "Personal", earliest: 17 * 60, latest: 23 * 60, max: 1 });

  const placedCounts = {};

  function chooseDesiredAt(pos) {
    // Simpler time-of-day rules to avoid placing morning items in evening
    const placed = (k) => (placedCounts[k] || 0) > 0;

    // Morning window
    if (pos < 11 * 60) {
      if (!placed("breakfast")) return desired.find(d => d.key === "breakfast");
      if (!placed("morning")) return desired.find(d => d.key === "morning");
      return desired.find(d => d.key === "focused");
    }

    // Midday window
    if (pos >= 11 * 60 && pos < 16 * 60) {
      if (!placed("lunch") && pos >= 11 * 60 && pos < 14 * 60) return desired.find(d => d.key === "lunch");
      return desired.find(d => d.key === "focused");
    }

    // Evening window
    if (pos >= 16 * 60) {
      if (!placed("dinner") && pos >= 17 * 60) return desired.find(d => d.key === "dinner");
      if (hobbyText && !placed("hobby") && pos >= 17 * 60) return desired.find(d => d.key === "hobby");
      if (!placed("chores") && pos >= 16 * 60) return desired.find(d => d.key === "chores");
      return desired.find(d => d.key === "afternoon") || desired.find(d => d.key === "focused");
    }

    // Fallback generic
    return desired.find(d => d.key === "focused") || { key: "free", title: "Free time", dur: 30, category: "Personal", earliest: 0, latest: 24 * 60, max: 100 };
  }

  // Fill each gap by selecting appropriate desired blocks based on time-of-day constraints
  for (const gap of gaps) {
    let pos = gap.start;
    while (pos < gap.end) {
      const d = chooseDesiredAt(pos);
      const remaining = gap.end - pos;
      const placeDur = Math.min(d.dur, remaining);
      blocks.push({ start: fromMinutes(pos), end: fromMinutes(pos + placeDur), title: d.title, category: d.category });
      if (!placedCounts[d.key]) placedCounts[d.key] = 0;
      placedCounts[d.key] += 1;
      pos += placeDur;
      // prevent infinite loop on zero-duration
      if (placeDur <= 0) break;
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
