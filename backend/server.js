import express from "express";
import cors from "cors";

// initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// health check endpoint
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// schedule generation endpoint
app.post("/generate", async (req, res) => {
  console.log("/generate request received", { body: req.body });
  const prompt = `You are a scheduling AI.\n\nRules:\n- Output valid JSON only\n- No explanations\n- No markdown\n\nSchema:\n{\n  \"date\": \"YYYY-MM-DD\",\n  \"blocks\": [\n    { \"start\": \"HH:MM\", \"end\": \"HH:MM\", \"title\": \"\", \"category\": \"Sleep|Health|Academics|Work|Personal\" }\n  ]\n}\n\nInput:\n${JSON.stringify(req.body)}`;

  // By default use the deterministic fallback scheduler.
  // Set environment variable `USE_MODEL=true` to attempt calling the local model instead.
  const useModel = process.env.USE_MODEL === "true";
  if (!useModel) {
    console.log("Using fallback scheduler (USE_MODEL not set)");
    const fallback = buildFallbackSchedule(req.body);
    return res.json(fallback);
  }

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

  // Diversified filler: prefer single-instance items (meals, hobby) then rotate through health/personal/work blocks
  const placedCounts = {};
  const desiredItems = [];
  if (hobbyText) {
    desiredItems.push({ key: "hobby", title: `Hobby: ${hobbyText}`, category: "Personal", dur: 60, single: true, maxPerDay: 1, earliest: hobbyWindow ? hobbyWindow.earliest : wakeMin, latest: hobbyWindow ? hobbyWindow.latest : bedMin });
  }
  // Meals and single items
  desiredItems.push({ key: "breakfast", title: "Breakfast", category: "Personal", dur: 30, single: true, maxPerDay: 1, earliest: wakeMin, latest: 11 * 60 });
  desiredItems.push({ key: "lunch", title: "Lunch", category: "Personal", dur: 60, single: true, maxPerDay: 1, earliest: 11 * 60, latest: 14 * 60 });
  desiredItems.push({ key: "dinner", title: "Dinner", category: "Personal", dur: 45, single: true, maxPerDay: 1, earliest: 17 * 60, latest: 22 * 60 });
  desiredItems.push({ key: "chores", title: "Chores", category: "Personal", dur: 45, single: true, maxPerDay: 1, earliest: 16 * 60, latest: 21 * 60 });

  // Health / Personal activities
  desiredItems.push({ key: "gym", title: "Gym", category: "Health", dur: 45, single: false, maxPerDay: 1, earliest: 6 * 60, latest: 10 * 60 });
  desiredItems.push({ key: "walk", title: "Outdoor walk", category: "Health", dur: 25, single: false, maxPerDay: 1, earliest: 6 * 60, latest: 20 * 60 });
  desiredItems.push({ key: "selfcare", title: "Self-care", category: "Personal", dur: 30, single: false, maxPerDay: 1, earliest: 7 * 60, latest: 22 * 60 });
  desiredItems.push({ key: "reading", title: "Reading", category: "Personal", dur: 30, single: false, maxPerDay: 2, earliest: 6 * 60, latest: 23 * 60 });
  desiredItems.push({ key: "break", title: "Break", category: "Personal", dur: 15, single: false, maxPerDay: 3, earliest: wakeMin, latest: bedMin });

  // Work blocks (repeatable)
  desiredItems.push({ key: "afternoon", title: "Afternoon work", category: "Work", dur: 120, single: false, maxPerDay: 2, earliest: 12 * 60, latest: 18 * 60 });
  desiredItems.push({ key: "focused", title: "Focused work", category: "Work", dur: 60, single: false, maxPerDay: 3, earliest: wakeMin, latest: bedMin });

  function canPlace(d, pos, remaining) {
    if (pos < (d.earliest || wakeMin)) return false;
    if (pos >= (d.latest || bedMin)) return false;
    const placed = placedCounts[d.key] || 0;
    if (d.maxPerDay && placed >= d.maxPerDay) return false;
    const maxDur = Math.min(d.dur || 30, remaining, (d.latest || bedMin) - pos);
    return maxDur >= Math.min(15, d.dur || 15);
  }

  function chooseDesiredAt(pos, remaining) {
    // prefer single items not yet placed
    for (const d of desiredItems) {
      const placed = placedCounts[d.key] || 0;
      if (d.single && placed > 0) continue;
      if (d.maxPerDay && placed >= d.maxPerDay) continue;
      if (canPlace(d, pos, remaining)) return d;
    }
    // otherwise pick the least-used suitable item
    let candidate = null;
    let bestCount = Infinity;
    for (const d of desiredItems) {
      const placed = placedCounts[d.key] || 0;
      if (d.maxPerDay && placed >= d.maxPerDay) continue;
      if (!canPlace(d, pos, remaining)) continue;
      const c = placed;
      if (c < bestCount) {
        bestCount = c;
        candidate = d;
      }
    }
    return candidate;
  }

  for (const gap of gaps) {
    let pos = gap.start;
    while (pos < gap.end) {
      const remaining = gap.end - pos;

      // pick desired block by window and usage
      const choice = chooseDesiredAt(pos, remaining);
      if (!choice) {
        // fallback to focused/afternoon split
        const isAfternoon = pos >= 12 * 60 && pos < 18 * 60;
        const title = isAfternoon ? "Afternoon work" : "Focused work";
        const dur = Math.min(isAfternoon ? 120 : 60, remaining);
        blocks.push({ start: fromMinutes(pos), end: fromMinutes(pos + dur), title, category: "Work" });
        placedCounts[isAfternoon ? "afternoon" : "focused"] = (placedCounts[isAfternoon ? "afternoon" : "focused"] || 0) + 1;
        pos += dur;
        continue;
      }

      const dur = Math.min(choice.dur || 30, remaining, (choice.latest || bedMin) - pos);
      if (dur <= 0) break;
      blocks.push({ start: fromMinutes(pos), end: fromMinutes(pos + dur), title: choice.title, category: choice.category });
      placedCounts[choice.key] = (placedCounts[choice.key] || 0) + 1;
      pos += dur;
    }
  }

  blocks.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  return { date, blocks };
}

app.listen(3001, () => console.log("Backend running on port 3001"));
