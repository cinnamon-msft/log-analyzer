import express from "express";
import cors from "cors";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { analyzeRouter } from "./routes/analyze.js";
import { errorHandler } from "./middleware/error-handler.js";
import { securityMiddleware } from "./middleware/security.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(securityMiddleware);

// CORS configuration
app.use(
  cors({
    origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:5173", "http://localhost:3000"],
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: "1mb" }));

// API routes
app.use("/api", analyzeRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Development mode: show helpful message at root
if (process.env.NODE_ENV !== "production") {
  app.get("/", (_req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Log Analyzer API</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
            .container { text-align: center; padding: 40px; }
            h1 { color: #58a6ff; }
            a { color: #3fb950; font-size: 1.2em; }
            code { background: #21262d; padding: 4px 8px; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>📊 Log Analyzer API Server</h1>
            <p>This is the API backend running on port ${PORT}.</p>
            <p>👉 <a href="http://localhost:5173">Open the Web UI at localhost:5173</a></p>
            <p style="margin-top: 20px; color: #8b949e;">API endpoints available at <code>/api/*</code></p>
          </div>
        </body>
      </html>
    `);
  });
}

// Serve React app in production
const clientBuildPath = join(__dirname, "..", "..", "web", "dist");
if (process.env.NODE_ENV === "production" && existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));

  // SPA fallback
  app.get("*", (_req, res) => {
    res.sendFile(join(clientBuildPath, "index.html"));
  });
}

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Log Analyzer API server running on http://localhost:${PORT}`);
  if (process.env.NODE_ENV !== "production") {
    console.log(`\n🌐 Open the Web UI at: http://localhost:5173\n`);
  }
  console.log(`📊 API endpoints:`);
  console.log(`   POST /api/analyze       - Analyze single log file`);
  console.log(`   POST /api/analyze/multi - Analyze multiple log files`);
  console.log(`   GET  /api/health        - Health check`);
});

export { app };
