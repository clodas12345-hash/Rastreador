import express from "express";
import path from "path";
import fs from "fs";
import JSZip from "jszip";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

function resolvePort(): number {
  const portFlagIdx = process.argv.findIndex((a) => a === '--port' || a.startsWith('--port='));
  if (portFlagIdx !== -1) {
    const arg = process.argv[portFlagIdx];
    const val = arg.includes('=') ? arg.split('=')[1] : process.argv[portFlagIdx + 1];
    const parsed = Number(val);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  const envPort = Number(process.env.PORT);
  const nginxPort = Number(process.env.NGINX_PORT);
  if (process.env.NODE_ENV !== "production") {
    if (envPort > 0 && envPort !== nginxPort) return envPort;
    return Number(process.env.DEFAULT_APP_PORT) || 3000;
  }
  return envPort > 0 ? envPort : 3000;
}

async function startServer() {
  const app = express();
  const PORT = resolvePort();

  app.use(express.json({ limit: '50mb' }));

  // Direct endpoint for car browser / multimedia
  app.get(["/multimidia", "/carro"], (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'multimidia.html'));
  });

  // URL shortener proxy endpoint (cache + is.gd -> tinyurl fallback)
  const shortUrlCache = new Map<string, string>();
  app.options("/api/shorten", (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.sendStatus(204);
  });
  app.get("/api/shorten", async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const targetUrl = String(req.query.url || '').trim();
    const forceFresh = req.query.fresh === '1' || req.query.force === '1';
    if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    const cached = !forceFresh ? shortUrlCache.get(targetUrl) : undefined;
    if (cached) {
      return res.json({ shortUrl: cached, shortened: true });
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const isGdRes = await fetch(
        `https://is.gd/create.php?format=simple&url=${encodeURIComponent(targetUrl)}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);
      if (isGdRes.ok) {
        const text = (await isGdRes.text()).trim();
        if (text.startsWith('https://is.gd/') || text.startsWith('http://is.gd/')) {
          shortUrlCache.set(targetUrl, text);
          return res.json({ shortUrl: text, shortened: true });
        }
      }
    } catch (e) {
      // fallback below
    }

    try {
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 5000);
      const tinyRes = await fetch(
        `https://tinyurl.com/api-create.php?url=${encodeURIComponent(targetUrl)}`,
        { signal: controller2.signal }
      );
      clearTimeout(timeout2);
      if (tinyRes.ok) {
        const text = (await tinyRes.text()).trim();
        if (text.startsWith('https://tinyurl.com/') || text.startsWith('http://tinyurl.com/')) {
          shortUrlCache.set(targetUrl, text);
          return res.json({ shortUrl: text, shortened: true });
        }
      }
    } catch (e) {
      // fallback to original
    }

    return res.json({ shortUrl: targetUrl, shortened: false });
  });

  // Cross-device fleet metadata sync (photos, plates, names) for multimedia/public browsers
  const FLEET_SYNC_FILE = path.join('/tmp', 'gkd-fleet-sync.json');
  let syncedFleetProfiles: Record<string, any> = {};
  try {
    if (fs.existsSync(FLEET_SYNC_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(FLEET_SYNC_FILE, 'utf8'));
      if (parsed && typeof parsed === 'object') syncedFleetProfiles = parsed;
    }
  } catch {}

  app.options("/api/fleet-sync", (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(204);
  });

  app.get("/api/fleet-sync", (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ vehicles: Object.values(syncedFleetProfiles) });
  });

  app.post("/api/fleet-sync", (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const incoming = Array.isArray(req.body?.vehicles) ? req.body.vehicles : [];
    incoming.forEach((v: any) => {
      if (!v || (!v.id && !v.trackerNumber)) return;
      const key = String(v.id || v.trackerNumber);
      const prev = syncedFleetProfiles[key] || {};
      syncedFleetProfiles[key] = {
        ...prev,
        id: String(v.id || prev.id || key),
        trackerNumber: String(v.trackerNumber || prev.trackerNumber || ''),
        name: String(v.name || prev.name || ''),
        licensePlate: String(v.licensePlate || prev.licensePlate || ''),
        photoUrl: typeof v.photoUrl === 'string' && v.photoUrl.length > 0 ? v.photoUrl : (prev.photoUrl || ''),
        iconType: v.iconType || prev.iconType || 'car',
        color: v.color || prev.color || '#16a34a',
        updatedAt: Date.now()
      };
    });
    try {
      fs.writeFileSync(FLEET_SYNC_FILE, JSON.stringify(syncedFleetProfiles), 'utf8');
    } catch {}
    return res.json({ ok: true, count: Object.keys(syncedFleetProfiles).length });
  });

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
