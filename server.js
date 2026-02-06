const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk").default;
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

const anthropic = new Anthropic();

const SYSTEM_PROMPT =
  "Eres el equipo creativo de NOSOTROS, un medio digital mexicano. Lenguaje coloquial mexicano pero sin perder seriedad.";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "NOSOTROS API",
    timestamp: new Date().toISOString(),
  });
});

// Search news using Claude with web_search tool
app.post("/api/news", async (req, res) => {
  try {
    const { topic } = req.body;

    if (!topic) {
      return res.status(400).json({ error: "Se requiere un tema (topic)" });
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 5,
        },
      ],
      messages: [
        {
          role: "user",
          content: `Busca las noticias más recientes sobre: ${topic}. Dame un resumen de las 3-5 noticias más relevantes con sus fuentes.`,
        },
      ],
    });

    const textBlocks = response.content.filter(
      (block) => block.type === "text"
    );
    const text = textBlocks.map((block) => block.text).join("\n");

    res.json({ result: text, usage: response.usage });
  } catch (error) {
    console.error("Error en /api/news:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Generate content using Claude
app.post("/api/generate", async (req, res) => {
  try {
    const { prompt, platform } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Se requiere un prompt" });
    }

    const platformInstruction = platform
      ? `Genera contenido optimizado para ${platform}.`
      : "Genera contenido para redes sociales.";

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${platformInstruction}\n\nTema: ${prompt}`,
        },
      ],
    });

    const textBlocks = response.content.filter(
      (block) => block.type === "text"
    );
    const text = textBlocks.map((block) => block.text).join("\n");

    res.json({ result: text, usage: response.usage });
  } catch (error) {
    console.error("Error en /api/generate:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`NOSOTROS API corriendo en http://0.0.0.0:${PORT}`);
});
