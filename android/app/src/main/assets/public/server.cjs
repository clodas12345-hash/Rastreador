var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_jszip = __toESM(require("jszip"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = process.env.PORT || 3e3;
  app.use(import_express.default.json({ limit: "50mb" }));
  app.get("/api/download-zip", async (req, res) => {
    try {
      const zip = new import_jszip.default();
      const standaloneDir = import_path.default.join(process.cwd(), "public", "standalone");
      if (import_fs.default.existsSync(standaloneDir)) {
        const files = import_fs.default.readdirSync(standaloneDir);
        for (const file of files) {
          const filePath = import_path.default.join(standaloneDir, file);
          if (import_fs.default.statSync(filePath).isFile()) {
            const content = import_fs.default.readFileSync(filePath);
            zip.file(file, content);
          }
        }
      }
      const zipContent = await zip.generateAsync({ type: "nodebuffer" });
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", "attachment; filename=Rastreador-SPA.zip");
      res.send(zipContent);
    } catch (err) {
      console.error("Error generating zip:", err);
      res.status(500).json({ error: "Failed to generate ZIP file" });
    }
  });
  app.post("/api/help", async (req, res) => {
    try {
      const { prompt, file } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is missing." });
      }
      const ai = new import_genai.GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
      const contents = [];
      if (prompt) contents.push(prompt);
      if (file && file.data) {
        const base64Data = file.data.split(",")[1];
        contents.push({
          inlineData: {
            data: base64Data,
            mimeType: file.mimeType
          }
        });
      }
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: {
          systemInstruction: "Voc\xEA \xE9 um assistente virtual do GKD Mobility, um aplicativo de rastreamento de frota. Seja muito breve, pr\xE1tico e direto nas suas respostas. Responda em portugu\xEAs."
        }
      });
      res.json({ text: response.text });
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      res.status(500).json({ error: "Failed to generate response." });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
