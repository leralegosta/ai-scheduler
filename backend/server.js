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

  // Determine sleep interval using bed and wake. If bed provided, use bed->wake (allow crossing midnight).
  let sleepStartMin = null;
  let sleepEndMin = null;
  if (bed) {
    sleepStartMin = toMinutes(bed);
    sleepEndMin = toMinutes(wake);
    if (sleepEndMin <= sleepStartMin) sleepEndMin += 24 * 60; // crosses midnight
  } else {
    // default 8 hours ending at wake
    sleepEndMin = toMinutes(wake);
    sleepStartMin = sleepEndMin - 8 * 60;
  }

  // Helper: normalize commitments and convert to minute intervals (allow crossing midnight)
  const normCommitments = [];
  for (const c of commitments) {
    if (c && typeof c.start === "string" && typeof c.end === "string") {
      let s = toMinutes(c.start);
      let e = toMinutes(c.end);
      if (e <= s) e += 24 * 60;
      normCommitments.push({ start: s, end: e, title: c.title || "Commitment", category: c.category || "Work" });
    }
  }

  // Trim sleep if it overlaps any commitment: shorten sleep to avoid overlapping commitments
  let keepSleep = true;
  for (const cc of normCommitments) {
    if (!(sleepEndMin <= cc.start || cc.end <= sleepStartMin)) {
      // overlap exists
      // if commitment fully covers sleep -> drop sleep
      if (cc.start <= sleepStartMin && cc.end >= sleepEndMin) {
        keepSleep = false;
        break;
      }
      // overlap at sleep start -> move sleepStart after commitment
      if (cc.start <= sleepStartMin && cc.end < sleepEndMin) {
        sleepStartMin = cc.end;
      } else if (cc.start > sleepStartMin && cc.start < sleepEndMin) {
        // overlap at sleep end -> move sleepEnd before commitment
        sleepEndMin = cc.start;
      }
    }
  }

  if (keepSleep && sleepEndMin > sleepStartMin) {
    blocks.push({ start: fromMinutes(sleepStartMin), end: fromMinutes(sleepEndMin), title: "Sleep", category: "Sleep" });
  }

  // Add commitments as fixed blocks (converted back to HH:MM mod 24)
  for (const cc of normCommitments) {
    // normalize to day by mod 24h for display (events that end after midnight will use end time mod 24)
    blocks.push({ start: fromMinutes(cc.start), end: fromMinutes(cc.end), title: cc.title, category: cc.category });
  }

  // Proposed fillers (relative to wake)
  const fillers = [
    { start: toMinutes(wake) + 0, end: toMinutes(wake) + 30, title: "Morning routine", category: "Health" },
    { start: toMinutes(wake) + 60, end: toMinutes(wake) + 240, title: "Focused work", category: "Work" },
    { start: toMinutes(wake) + 240, end: toMinutes(wake) + 300, title: "Lunch", category: "Personal" },
    { start: toMinutes(wake) + 360, end: toMinutes(wake) + 540, title: "Study / Academics", category: "Academics" },
  ];

  // For each filler, if it overlaps any commitment or existing sleep block, trim or skip it
  for (const f of fillers) {
    let fStart = f.start;
    let fEnd = f.end;
    // allow filler end to cross midnight
    if (fEnd <= fStart) fEnd += 24 * 60;

    // Trim against sleep
    if (sleepEndMin && sleepStartMin && !(fEnd <= sleepStartMin || sleepEndMin <= fStart)) {
      // overlap: trim filler to after sleep or before sleep
      if (fStart < sleepStartMin && fEnd > sleepEndMin) {
        // filler fully covers sleep: split not supported -> skip
        continue;
      }
      if (fStart < sleepStartMin && fEnd > sleepStartMin) fEnd = sleepStartMin;
      if (fStart < sleepEndMin && fEnd > sleepEndMin) fStart = sleepEndMin;
    }

    // Trim against commitments
    for (const cc of normCommitments) {
      if (fEnd <= cc.start || cc.end <= fStart) continue;
      // overlap exists; try trimming filler start forward past commitment end
      if (cc.end < fEnd) {
        fStart = Math.max(fStart, cc.end);
      } else if (cc.start > fStart) {
        fEnd = Math.min(fEnd, cc.start);
      } else {
        // commitment fully covers filler -> skip
        fStart = fEnd;
      }
    }

    if (fEnd > fStart) {
      blocks.push({ start: fromMinutes(fStart), end: fromMinutes(fEnd), title: f.title, category: f.category });
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
