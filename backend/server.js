import express from "express";
import cors from "cors";
import { exec } from "child_process";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/generate", (req, res) => {
  const prompt = `
You are a scheduling AI.

Rules:
- Output valid JSON only
- No explanations
- No markdown

Schema:
{
  "date": "2026-01-07",
  "blocks": [
    { "start": "HH:MM", "end": "HH:MM", "title": "", "category": "" }
  ]
}

User preferences:
${JSON.stringify(req.body)}
`;

  exec(`ollama run llama3.1 "${prompt}"`, (err, stdout) => {
    if (err) return res.status(500).send(err);
    res.json(JSON.parse(stdout));
  });
});

app.listen(3001, () => {
  console.log("Backend running on port 3001");
});
