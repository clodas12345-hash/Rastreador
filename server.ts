import express from "express";
import path from "path";
import fs from "fs";
import JSZip from "jszip";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API endpoint to download standalone SPA zip
  app.get("/api/download-zip", async (req, res) => {
    try {
      const zip = new JSZip();
      const standaloneDir = path.join(process.cwd(), 'public', 'standalone');

      if (fs.existsSync(standaloneDir)) {
        const files = fs.readdirSync(standaloneDir);
        for (const file of files) {
          const filePath = path.join(standaloneDir, file);
          if (fs.statSync(filePath).isFile()) {
            const content = fs.readFileSync(filePath);
            zip.file(file, content);
          }
        }
      }

      const zipContent = await zip.generateAsync({ type: "nodebuffer" });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename=Rastreador-SPA.zip');
      res.send(zipContent);
    } catch (err) {
      console.error("Error generating zip:", err);
      res.status(500).json({ error: "Failed to generate ZIP file" });
    }
  });

  // API route for Gemini
  app.post("/api/help", async (req, res) => {
    try {
      const { prompt, file } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is missing." });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const contents: any[] = [];
      if (prompt) contents.push(prompt);
      
      if (file && file.data) {
        // Remove data URL prefix like "data:image/png;base64,"
        const base64Data = file.data.split(',')[1];
        contents.push({
          inlineData: {
            data: base64Data,
            mimeType: file.mimeType,
          }
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: {
          systemInstruction: "Você é um assistente virtual do GKD Mobility, um aplicativo de rastreamento de frota. Seja muito breve, prático e direto nas suas respostas. Responda em português.",
        }
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Error calling Gemini API:", error);
      res.status(500).json({ error: "Failed to generate response." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
