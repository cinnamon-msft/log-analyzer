import { Router, Request, Response } from "express";
import { LogAnalyzer, IssueSuggester } from "@log-analyzer/core";
import type {
  ApiResponse,
  LogAnalysisResult,
  MultiFileAnalysisResult,
  IssueSuggestion,
  AnalysisProgress,
} from "@log-analyzer/shared";
import { uploadMiddleware } from "../middleware/upload.js";

export const analyzeRouter = Router();

/**
 * Store for SSE connections to send progress updates
 */
const progressConnections = new Map<string, Response>();

/**
 * Store for streaming text updates
 */
const streamingConnections = new Map<string, Response>();

/**
 * Helper to send SSE data
 */
function sendSSE(res: Response, data: unknown): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * POST /api/analyze
 * Analyze a single log file
 */
analyzeRouter.post(
  "/analyze",
  uploadMiddleware.single("file"),
  async (req: Request, res: Response) => {
    const file = req.file;
    const requestId = req.headers["x-request-id"] as string || Date.now().toString();

    if (!file) {
      res.status(400).json({
        success: false,
        error: "No file uploaded",
      } as ApiResponse<null>);
      return;
    }

    const analyzer = new LogAnalyzer();
    let suggester: IssueSuggester | null = null;

    try {
      await analyzer.initialize();

      // Set up progress listener
      analyzer.on("progress", (progress: AnalysisProgress) => {
        const sseRes = progressConnections.get(requestId);
        if (sseRes) {
          sendSSE(sseRes, { type: "progress", ...progress });
        }
      });

      // Set up streaming listener for AI reasoning
      analyzer.on("streaming", (delta: string, fullText: string) => {
        const sseRes = progressConnections.get(requestId);
        if (sseRes) {
          sendSSE(sseRes, { type: "streaming", delta, fullText });
        }
      });

      // Analyze the file from buffer
      const result = await analyzer.analyzeLogBuffer(file.buffer, file.originalname);

      // Generate issue suggestions if requested
      let issueSuggestions: IssueSuggestion[] | undefined;
      const { suggestIssues, repo } = req.body;

      if (suggestIssues === "true" || suggestIssues === true) {
        // Use GitHub token from environment for authenticated issue searches
        const githubToken = process.env.GITHUB_TOKEN;
        suggester = new IssueSuggester(githubToken);
        await suggester.initialize();
        // Pass raw log content for exact text matching in GitHub search
        const rawLogContent = file.buffer.toString('utf-8');
        issueSuggestions = await suggester.suggestIssues(result, repo || undefined, true, rawLogContent);
        // Add source file to each suggestion for single-file analysis
        if (issueSuggestions) {
          for (const suggestion of issueSuggestions) {
            suggestion.sourceFiles = [file.originalname];
          }
        }
        await suggester.cleanup();
      }

      await analyzer.cleanup();

      // Send completion to SSE if connected
      const sseRes = progressConnections.get(requestId);
      if (sseRes) {
        sendSSE(sseRes, { type: "complete" });
      }

      res.json({
        success: true,
        data: {
          analysis: result,
          issueSuggestions,
          filename: file.originalname,
          fileSize: file.size,
        },
      } as ApiResponse<{
        analysis: LogAnalysisResult;
        issueSuggestions?: IssueSuggestion[];
        filename: string;
        fileSize: number;
      }>);
    } catch (error) {
      await analyzer.cleanup();
      if (suggester) {
        await suggester.cleanup();
      }

      // Log error with sanitized information
      if (process.env.NODE_ENV === "production") {
        console.error("Analysis error:", {
          message: error instanceof Error ? error.message : "Unknown error",
          name: error instanceof Error ? error.name : "Error",
          timestamp: new Date().toISOString()
        });
      } else {
        console.error("Analysis error:", error);
      }
      
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Analysis failed",
      } as ApiResponse<null>);
    } finally {
      progressConnections.delete(requestId);
    }
  }
);

/**
 * POST /api/analyze/multi
 * Analyze multiple log files with similarity detection
 */
analyzeRouter.post(
  "/analyze/multi",
  uploadMiddleware.array("files", 10),
  async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[] | undefined;
    const requestId = req.headers["x-request-id"] as string || Date.now().toString();

    if (!files || files.length === 0) {
      res.status(400).json({
        success: false,
        error: "No files uploaded",
      } as ApiResponse<null>);
      return;
    }

    if (files.length < 2) {
      res.status(400).json({
        success: false,
        error: "At least 2 files are required for multi-file analysis",
      } as ApiResponse<null>);
      return;
    }

    const analyzer = new LogAnalyzer();
    let suggester: IssueSuggester | null = null;

    try {
      await analyzer.initialize();

      // Set up progress listener
      analyzer.on("progress", (progress: AnalysisProgress) => {
        const sseRes = progressConnections.get(requestId);
        if (sseRes) {
          sendSSE(sseRes, { type: "progress", ...progress });
        }
      });

      // Set up streaming listener for AI reasoning
      analyzer.on("streaming", (delta: string, fullText: string) => {
        const sseRes = progressConnections.get(requestId);
        if (sseRes) {
          sendSSE(sseRes, { type: "streaming", delta, fullText });
        }
      });

      // Prepare files for analysis
      const fileData = files.map((f) => ({
        buffer: f.buffer,
        filename: f.originalname,
      }));

      // Analyze all files
      const result = await analyzer.analyzeMultipleBuffers(fileData);

      // Generate issue suggestions if requested
      let issueSuggestions: IssueSuggestion[] | undefined;
      const { suggestIssues, repo } = req.body;

      if (suggestIssues === "true" || suggestIssues === true) {
        // Use GitHub token from environment for authenticated issue searches
        const githubToken = process.env.GITHUB_TOKEN;
        suggester = new IssueSuggester(githubToken);
        await suggester.initialize();
        
        // Combine all files' analysis results for better issue suggestions
        if (result.fileResults.length > 0) {
          // Build a map of content -> files for tracking source files
          const contentToFiles = new Map<string, Set<string>>();
          
          for (const fileResult of result.fileResults) {
            const filename = fileResult.filename;
            // Track which file each pattern/anomaly/rootCause comes from
            for (const item of [...fileResult.analysis.patterns, 
                                 ...fileResult.analysis.anomalies, 
                                 ...fileResult.analysis.rootCauses]) {
              const normalized = item.toLowerCase().trim();
              if (!contentToFiles.has(normalized)) {
                contentToFiles.set(normalized, new Set());
              }
              contentToFiles.get(normalized)!.add(filename);
            }
          }
          
          // Merge all analysis results into one for issue suggestion
          const combinedAnalysis: LogAnalysisResult = {
            patterns: result.fileResults.flatMap(f => f.analysis.patterns),
            anomalies: result.fileResults.flatMap(f => f.analysis.anomalies),
            rootCauses: result.fileResults.flatMap(f => f.analysis.rootCauses),
            summary: result.fileResults.map(f => f.analysis.summary).join('\n\n'),
          };
          
          console.log('[Issue Suggester] Combined analysis:', {
            patterns: combinedAnalysis.patterns.length,
            anomalies: combinedAnalysis.anomalies.length,
            rootCauses: combinedAnalysis.rootCauses.length,
          });
          
          // Combine all raw log content for exact text matching
          const combinedRawContent = fileData
            .map(f => f.buffer.toString('utf-8'))
            .join('\n\n---FILE SEPARATOR---\n\n');
          
          issueSuggestions = await suggester.suggestIssues(
            combinedAnalysis,
            repo || undefined,
            true,
            combinedRawContent
          );
          
          // Match issue suggestions back to source files
          if (issueSuggestions) {
            for (const suggestion of issueSuggestions) {
              const sourceFiles = new Set<string>();
              const errorSig = suggestion.errorSignature.toLowerCase();
              
              // Check each file's content for matches to this error signature
              for (const fileResult of result.fileResults) {
                const allContent = [
                  ...fileResult.analysis.patterns,
                  ...fileResult.analysis.anomalies,
                  ...fileResult.analysis.rootCauses,
                  fileResult.analysis.summary
                ].join(' ').toLowerCase();
                
                // Check if error signature keywords appear in this file's analysis
                const sigWords = errorSig.split(/\s+/).filter(w => w.length > 3);
                const matchScore = sigWords.filter(word => allContent.includes(word)).length;
                
                if (matchScore >= Math.min(2, sigWords.length) || allContent.includes(errorSig)) {
                  sourceFiles.add(fileResult.filename);
                }
              }
              
              // If no matches found, check against the original content map
              if (sourceFiles.size === 0) {
                for (const [content, files] of contentToFiles.entries()) {
                  if (content.includes(errorSig) || errorSig.includes(content.slice(0, 50))) {
                    for (const file of files) {
                      sourceFiles.add(file);
                    }
                  }
                }
              }
              
              // If still no matches but only one file, default to that file
              if (sourceFiles.size === 0 && result.fileResults.length === 1) {
                sourceFiles.add(result.fileResults[0].filename);
              }
              
              suggestion.sourceFiles = Array.from(sourceFiles);
            }
          }
          
          console.log('[Issue Suggester] Found suggestions:', issueSuggestions?.length || 0);
        }
        await suggester.cleanup();
      }

      await analyzer.cleanup();

      // Send completion to SSE if connected
      const sseRes = progressConnections.get(requestId);
      if (sseRes) {
        sendSSE(sseRes, { type: "complete" });
      }

      res.json({
        success: true,
        data: {
          analysis: result,
          issueSuggestions,
        },
      } as ApiResponse<{
        analysis: MultiFileAnalysisResult;
        issueSuggestions?: IssueSuggestion[];
      }>);
    } catch (error) {
      await analyzer.cleanup();
      if (suggester) {
        await suggester.cleanup();
      }

      // Log error with sanitized information
      if (process.env.NODE_ENV === "production") {
        console.error("Multi-file analysis error:", {
          message: error instanceof Error ? error.message : "Unknown error",
          name: error instanceof Error ? error.name : "Error",
          timestamp: new Date().toISOString()
        });
      } else {
        console.error("Multi-file analysis error:", error);
      }
      
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Analysis failed",
      } as ApiResponse<null>);
    } finally {
      progressConnections.delete(requestId);
    }
  }
);

/**
 * GET /api/analyze/progress/:id
 * SSE endpoint for real-time progress and streaming updates
 */
analyzeRouter.get("/analyze/progress/:id", (req: Request, res: Response) => {
  const { id } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

  progressConnections.set(id, res);

  // Send initial connection message
  sendSSE(res, { type: "connected", stage: "connected", progress: 0, message: "Connected to streaming" });

  // Cleanup on client disconnect
  req.on("close", () => {
    progressConnections.delete(id);
  });
});
