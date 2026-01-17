import { CopilotClient, CopilotSession } from "@github/copilot-sdk";
import { createReadStream, existsSync, statSync } from "fs";
import { readFile } from "fs/promises";
import { dirname, join, basename } from "path";
import { fileURLToPath } from "url";
import { EventEmitter } from "events";
import type {
  LogAnalysisResult,
  MultiFileAnalysisResult,
  FileAnalysisResult,
  SimilarityResult,
  ChunkAnalysisResult,
  AnalysisProgress,
  ExactLineMatch,
} from "@log-analyzer/shared";

/** Chunk size for large file processing (~500KB = ~125K tokens) */
const CHUNK_SIZE = 500 * 1024;

/** Maximum lines per chunk to maintain context boundaries */
const MAX_LINES_PER_CHUNK = 5000;

/** Default parallelism for chunk processing */
const DEFAULT_PARALLEL_CHUNKS = 3;

/**
 * Options for the LogAnalyzer
 */
export interface LogAnalyzerOptions {
  /** Model to use (default: gpt-4o) */
  model?: "gpt-4o" | "gpt-4o-mini" | "claude-sonnet-4-5";
  /** Number of chunks to process in parallel (default: 3) */
  parallelChunks?: number;
}

/**
 * Resolves the path to the copilot CLI binary.
 */
function resolveCopilotCliPath(): string {
  try {
    const copilotSdkPath = import.meta.resolve("@github/copilot-sdk");
    const sdkDir = dirname(fileURLToPath(copilotSdkPath));
    const cliPath = join(sdkDir, "..", "..", "copilot", "npm-loader.js");

    if (!existsSync(cliPath)) {
      throw new Error(`Copilot CLI not found at expected path: ${cliPath}`);
    }

    return cliPath;
  } catch (error) {
    throw new Error(
      `Failed to resolve Copilot CLI path: ${error instanceof Error ? error.message : String(error)}. ` +
        "Ensure @github/copilot is installed as a dependency."
    );
  }
}

/**
 * Process items in parallel with a concurrency limit
 */
async function parallelMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

export interface LogAnalyzerEvents {
  progress: (progress: AnalysisProgress) => void;
  streaming: (text: string, fullText: string) => void;
}

export class LogAnalyzer extends EventEmitter {
  private client: CopilotClient;
  private session: CopilotSession | null = null;
  private options: Required<LogAnalyzerOptions>;

  constructor(options: LogAnalyzerOptions = {}) {
    super();
    this.options = {
      model: options.model ?? "gpt-4o",
      parallelChunks: options.parallelChunks ?? DEFAULT_PARALLEL_CHUNKS,
    };
    this.client = new CopilotClient({
      cliPath: resolveCopilotCliPath(),
    });
  }

  /**
   * Initialize the analyzer by starting the Copilot client and creating a session
   */
  async initialize(): Promise<void> {
    await this.client.start();
    this.session = await this.client.createSession({
      model: this.options.model,
    });
  }

  /**
   * Emit a progress update
   */
  private emitProgress(progress: AnalysisProgress): void {
    this.emit("progress", progress);
  }

  /**
   * Analyze a log file, automatically chunking if the file is large
   * @param logFilePath Path to the log file to analyze
   * @returns Analysis results including patterns, anomalies, and root causes
   */
  async analyzeLogFile(logFilePath: string): Promise<LogAnalysisResult> {
    if (!this.session) {
      throw new Error("Analyzer not initialized. Call initialize() first.");
    }

    if (!existsSync(logFilePath)) {
      throw new Error(`Log file not found: ${logFilePath}`);
    }

    const stats = statSync(logFilePath);
    const fileSize = stats.size;

    // For small files, use direct analysis
    if (fileSize <= CHUNK_SIZE) {
      this.emitProgress({
        stage: "analyzing",
        progress: 0,
        message: "Analyzing log file...",
      });

      const result = await this.analyzeLogFileDirect(logFilePath);

      this.emitProgress({
        stage: "complete",
        progress: 100,
        message: "Analysis complete",
      });

      return result;
    }

    // For large files, use chunked analysis
    return this.analyzeLogFileInChunks(logFilePath);
  }

  /**
   * Analyze a log file directly (for small files)
   */
  private async analyzeLogFileDirect(logFilePath: string): Promise<LogAnalysisResult> {
    if (!this.session) {
      throw new Error("Analyzer not initialized. Call initialize() first.");
    }

    const prompt = `You are an expert log analyzer. Please analyze the attached log file and provide:

1. **Patterns**: Common patterns found in the logs (e.g., recurring error messages, API endpoints being called, user behaviors)
2. **Anomalies**: Unusual or unexpected events, errors, or behaviors that stand out
3. **Root Causes**: Potential root causes for any errors or issues found in the logs

Please structure your response in the following format:
## PATTERNS
- [List patterns here]

## ANOMALIES
- [List anomalies here]

## ROOT CAUSES
- [List root causes here]

## SUMMARY
[Provide a brief summary of the overall health and key findings]`;

    const response = await this.session.sendAndWait({
      prompt,
      attachments: [
        {
          type: "file",
          path: logFilePath,
          displayName: "log-file.log",
        },
      ],
    });

    if (!response || !response.data.content) {
      throw new Error("No response received from Copilot");
    }

    return this.parseAnalysisResponse(response.data.content);
  }

  /**
   * Analyze a large log file in chunks with progress updates
   * @param logFilePath Path to the log file
   * @returns Aggregated analysis results
   */
  async analyzeLogFileInChunks(logFilePath: string): Promise<LogAnalysisResult> {
    if (!this.session) {
      throw new Error("Analyzer not initialized. Call initialize() first.");
    }

    this.emitProgress({
      stage: "scanning",
      progress: 0,
      message: "Scanning file structure...",
    });

    // Read file and split into chunks by lines
    const content = await readFile(logFilePath, "utf-8");
    const lines = content.split("\n");
    const chunks = this.splitIntoChunks(lines);

    this.emitProgress({
      stage: "analyzing",
      progress: 0,
      message: `Processing ${chunks.length} chunks in parallel (concurrency: ${this.options.parallelChunks})...`,
      currentChunk: 0,
      totalChunks: chunks.length,
    });

    // Analyze chunks in parallel with concurrency limit
    let completedChunks = 0;

    const chunkResults = await parallelMap(
      chunks,
      async (chunk, i) => {
        const result = await this.analyzeLogContent(chunk.content);
        completedChunks++;

        this.emitProgress({
          stage: "analyzing",
          progress: Math.round((completedChunks / chunks.length) * 80),
          message: `Analyzed chunk ${completedChunks} of ${chunks.length}...`,
          currentChunk: completedChunks,
          totalChunks: chunks.length,
        });

        return {
          chunkId: i,
          lineRange: chunk.lineRange,
          patterns: result.patterns,
          anomalies: result.anomalies,
          rootCauses: result.rootCauses,
        } as ChunkAnalysisResult;
      },
      this.options.parallelChunks
    );

    // Aggregate results
    this.emitProgress({
      stage: "aggregating",
      progress: 85,
      message: "Aggregating results...",
    });

    const aggregatedResult = await this.aggregateChunkResults(chunkResults);

    this.emitProgress({
      stage: "complete",
      progress: 100,
      message: "Analysis complete",
    });

    return aggregatedResult;
  }

  /**
   * Split content lines into manageable chunks
   */
  private splitIntoChunks(
    lines: string[]
  ): { content: string; lineRange: { start: number; end: number } }[] {
    const chunks: { content: string; lineRange: { start: number; end: number } }[] = [];
    let currentChunk: string[] = [];
    let currentSize = 0;
    let chunkStartLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineSize = line.length + 1; // +1 for newline

      if (
        (currentSize + lineSize > CHUNK_SIZE || currentChunk.length >= MAX_LINES_PER_CHUNK) &&
        currentChunk.length > 0
      ) {
        // Save current chunk
        chunks.push({
          content: currentChunk.join("\n"),
          lineRange: { start: chunkStartLine + 1, end: i },
        });

        // Start new chunk
        currentChunk = [line];
        currentSize = lineSize;
        chunkStartLine = i;
      } else {
        currentChunk.push(line);
        currentSize += lineSize;
      }
    }

    // Don't forget the last chunk
    if (currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.join("\n"),
        lineRange: { start: chunkStartLine + 1, end: lines.length },
      });
    }

    return chunks;
  }

  /**
   * Aggregate chunk results using Copilot for intelligent summarization
   */
  private async aggregateChunkResults(
    chunks: ChunkAnalysisResult[]
  ): Promise<LogAnalysisResult> {
    if (!this.session) {
      throw new Error("Analyzer not initialized.");
    }

    // If only one chunk, return it directly
    if (chunks.length === 1) {
      return {
        patterns: chunks[0].patterns,
        anomalies: chunks[0].anomalies,
        rootCauses: chunks[0].rootCauses,
        summary: "Single chunk analysis completed.",
      };
    }

    const aggregationPrompt = `You analyzed a log file in ${chunks.length} segments. Here are the findings from each segment:

${chunks
  .map(
    (chunk) => `
### Segment ${chunk.chunkId + 1} (Lines ${chunk.lineRange.start}-${chunk.lineRange.end})
**Patterns:** ${chunk.patterns.join("; ") || "None found"}
**Anomalies:** ${chunk.anomalies.join("; ") || "None found"}
**Root Causes:** ${chunk.rootCauses.join("; ") || "None found"}
`
  )
  .join("\n")}

Please consolidate these findings into a unified analysis, removing duplicates and identifying cross-segment patterns.

Provide your response in this format:
## PATTERNS
- [Consolidated patterns across all segments]

## ANOMALIES
- [Consolidated anomalies across all segments]

## ROOT CAUSES
- [Consolidated root causes across all segments]

## SUMMARY
[A comprehensive summary of the entire log file based on all segments]`;

    const response = await this.session.sendAndWait({ prompt: aggregationPrompt });

    if (!response || !response.data.content) {
      // Fallback: merge results manually
      return this.mergeChunkResultsManually(chunks);
    }

    return this.parseAnalysisResponse(response.data.content);
  }

  /**
   * Fallback manual merge of chunk results
   */
  private mergeChunkResultsManually(chunks: ChunkAnalysisResult[]): LogAnalysisResult {
    const allPatterns = new Set<string>();
    const allAnomalies = new Set<string>();
    const allRootCauses = new Set<string>();

    for (const chunk of chunks) {
      chunk.patterns.forEach((p) => allPatterns.add(p));
      chunk.anomalies.forEach((a) => allAnomalies.add(a));
      chunk.rootCauses.forEach((r) => allRootCauses.add(r));
    }

    return {
      patterns: Array.from(allPatterns),
      anomalies: Array.from(allAnomalies),
      rootCauses: Array.from(allRootCauses),
      summary: `Analyzed ${chunks.length} segments of the log file.`,
    };
  }

  /**
   * Emit a streaming text update
   */
  private emitStreaming(delta: string, fullText: string): void {
    this.emit("streaming", delta, fullText);
  }

  /**
   * Analyze log content directly (useful for streaming logs or in-memory logs)
   * @param logContent The log content as a string
   * @returns Analysis results
   */
  async analyzeLogContent(logContent: string): Promise<LogAnalysisResult> {
    if (!this.session) {
      throw new Error("Analyzer not initialized. Call initialize() first.");
    }

    const prompt = `You are an expert log analyzer. Please analyze the following log content and provide:

1. **Patterns**: Common patterns found in the logs
2. **Anomalies**: Unusual or unexpected events, errors, or behaviors
3. **Root Causes**: Potential root causes for any errors or issues

Please structure your response in the following format:
## PATTERNS
- [List patterns here]

## ANOMALIES
- [List anomalies here]

## ROOT CAUSES
- [List root causes here]

## SUMMARY
[Provide a brief summary]

Log Content:
\`\`\`
${logContent}
\`\`\``;

    // Use streaming to get real-time updates
    let fullResponse = "";
    let charCount = 0;
    
    const unsubscribe = this.session.on((event) => {
      if (event.type === "assistant.message_delta") {
        fullResponse += event.data.deltaContent;
        charCount += event.data.deltaContent.length;
        this.emitStreaming(event.data.deltaContent, fullResponse);
        
        // Emit progress updates based on response length (estimate ~2000 chars for full response)
        const estimatedProgress = Math.min(90, 20 + Math.round((charCount / 2000) * 70));
        this.emitProgress({
          stage: "analyzing",
          progress: estimatedProgress,
          message: `AI generating analysis...`,
        });
      } else if (event.type === "assistant.reasoning_delta") {
        // Emit reasoning as streaming text too
        this.emitStreaming(event.data.deltaContent, fullResponse);
      }
    });

    try {
      const response = await this.session.sendAndWait({ prompt });
      unsubscribe();

      if (!response || !response.data.content) {
        throw new Error("No response received from Copilot");
      }

      return this.parseAnalysisResponse(response.data.content);
    } catch (error) {
      unsubscribe();
      throw error;
    }
  }

  /**
   * Analyze multiple log files and find similarities between them
   * @param logFilePaths Array of paths to log files
   * @returns Multi-file analysis results with similarities
   */
  async analyzeMultipleLogFiles(logFilePaths: string[]): Promise<MultiFileAnalysisResult> {
    if (!this.session) {
      throw new Error("Analyzer not initialized. Call initialize() first.");
    }

    if (logFilePaths.length === 0) {
      throw new Error("No log files provided");
    }

    this.emitProgress({
      stage: "analyzing",
      progress: 0,
      message: `Analyzing ${logFilePaths.length} files...`,
    });

    // Analyze each file individually
    const fileResults: FileAnalysisResult[] = [];

    for (let i = 0; i < logFilePaths.length; i++) {
      const filePath = logFilePaths[i];

      this.emitProgress({
        stage: "analyzing",
        progress: Math.round((i / logFilePaths.length) * 70),
        message: `Analyzing file ${i + 1} of ${logFilePaths.length}: ${basename(filePath)}`,
      });

      if (!existsSync(filePath)) {
        throw new Error(`Log file not found: ${filePath}`);
      }

      const stats = statSync(filePath);
      const analysis = await this.analyzeLogFile(filePath);

      fileResults.push({
        filename: basename(filePath),
        fileSize: stats.size,
        analysis,
      });
    }

    // Find similarities across files
    this.emitProgress({
      stage: "aggregating",
      progress: 75,
      message: "Detecting similarities across files...",
    });

    const similarities = await this.findSimilarities(fileResults);

    // Generate overall summary
    this.emitProgress({
      stage: "aggregating",
      progress: 90,
      message: "Generating summary...",
    });

    const overallSummary = await this.generateMultiFileSummary(fileResults, similarities);

    this.emitProgress({
      stage: "complete",
      progress: 100,
      message: "Multi-file analysis complete",
    });

    return {
      fileResults,
      similarities,
      overallSummary,
    };
  }

  /**
   * Find similarities across multiple file analysis results
   */
  private async findSimilarities(fileResults: FileAnalysisResult[]): Promise<SimilarityResult> {
    if (!this.session) {
      throw new Error("Analyzer not initialized.");
    }

    if (fileResults.length < 2) {
      return {
        sharedPatterns: [],
        sharedAnomalies: [],
        sharedRootCauses: [],
        correlations: [],
      };
    }

    const comparisonPrompt = `You are analyzing ${fileResults.length} different log files. Here are the analysis results for each:

${fileResults
  .map(
    (fr, i) => `
### File ${i + 1}: ${fr.filename} (${(fr.fileSize / 1024).toFixed(1)} KB)
**Patterns:** ${fr.analysis.patterns.join("; ") || "None found"}
**Anomalies:** ${fr.analysis.anomalies.join("; ") || "None found"}
**Root Causes:** ${fr.analysis.rootCauses.join("; ") || "None found"}
**Summary:** ${fr.analysis.summary}
`
  )
  .join("\n")}

Please identify:
1. **Shared Patterns**: Patterns that appear in multiple files (indicate which files)
2. **Shared Anomalies**: Anomalies that appear in multiple files
3. **Shared Root Causes**: Root causes that are common across files
4. **Correlations**: Any correlations between events in different files (e.g., timing relationships, cascading failures)

Format your response as:
## SHARED PATTERNS
- [Pattern that appears in multiple files]

## SHARED ANOMALIES
- [Anomaly that appears in multiple files]

## SHARED ROOT CAUSES
- [Root cause common across files]

## CORRELATIONS
- [Correlation between files]`;

    const response = await this.session.sendAndWait({ prompt: comparisonPrompt });

    if (!response || !response.data.content) {
      // Fallback: simple set intersection
      return this.findSimilaritiesManually(fileResults);
    }

    return this.parseSimilaritiesResponse(response.data.content);
  }

  /**
   * Parse similarities response from Copilot
   */
  private parseSimilaritiesResponse(content: string): SimilarityResult {
    const result: SimilarityResult = {
      sharedPatterns: [],
      sharedAnomalies: [],
      sharedRootCauses: [],
      correlations: [],
    };

    const sections = {
      sharedPatterns: /## SHARED PATTERNS\s*([\s\S]*?)(?=## |$)/i,
      sharedAnomalies: /## SHARED ANOMALIES\s*([\s\S]*?)(?=## |$)/i,
      sharedRootCauses: /## SHARED ROOT CAUSES\s*([\s\S]*?)(?=## |$)/i,
      correlations: /## CORRELATIONS\s*([\s\S]*?)$/i,
    };

    const patternsMatch = content.match(sections.sharedPatterns);
    if (patternsMatch) {
      result.sharedPatterns = this.extractListItems(patternsMatch[1]);
    }

    const anomaliesMatch = content.match(sections.sharedAnomalies);
    if (anomaliesMatch) {
      result.sharedAnomalies = this.extractListItems(anomaliesMatch[1]);
    }

    const rootCausesMatch = content.match(sections.sharedRootCauses);
    if (rootCausesMatch) {
      result.sharedRootCauses = this.extractListItems(rootCausesMatch[1]);
    }

    const correlationsMatch = content.match(sections.correlations);
    if (correlationsMatch) {
      result.correlations = this.extractListItems(correlationsMatch[1]);
    }

    return result;
  }

  /**
   * Fallback manual similarity detection
   */
  private findSimilaritiesManually(fileResults: FileAnalysisResult[]): SimilarityResult {
    const patternCounts = new Map<string, number>();
    const anomalyCounts = new Map<string, number>();
    const rootCauseCounts = new Map<string, number>();

    for (const fr of fileResults) {
      fr.analysis.patterns.forEach((p) => {
        const normalized = p.toLowerCase();
        patternCounts.set(normalized, (patternCounts.get(normalized) || 0) + 1);
      });
      fr.analysis.anomalies.forEach((a) => {
        const normalized = a.toLowerCase();
        anomalyCounts.set(normalized, (anomalyCounts.get(normalized) || 0) + 1);
      });
      fr.analysis.rootCauses.forEach((r) => {
        const normalized = r.toLowerCase();
        rootCauseCounts.set(normalized, (rootCauseCounts.get(normalized) || 0) + 1);
      });
    }

    const threshold = 2; // Appears in at least 2 files

    return {
      sharedPatterns: Array.from(patternCounts.entries())
        .filter(([, count]) => count >= threshold)
        .map(([pattern]) => pattern),
      sharedAnomalies: Array.from(anomalyCounts.entries())
        .filter(([, count]) => count >= threshold)
        .map(([anomaly]) => anomaly),
      sharedRootCauses: Array.from(rootCauseCounts.entries())
        .filter(([, count]) => count >= threshold)
        .map(([cause]) => cause),
      correlations: [],
    };
  }

  /**
   * Find exact line matches between multiple files
   * Normalizes lines by removing timestamps and variable data, then finds duplicates
   */
  private findExactLineMatches(
    files: { content: string; filename: string }[]
  ): ExactLineMatch[] {
    if (files.length < 2) {
      return [];
    }

    // Map of normalized line -> { original line, occurrences by file }
    const lineMap = new Map<string, {
      original: string;
      occurrences: Map<string, number[]>;
      category: 'error' | 'warning' | 'info' | 'debug' | 'other';
    }>();

    // Patterns to normalize (remove timestamps, IDs, etc.)
    const normalizePatterns = [
      /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.,]?\d*Z?\s*/i, // ISO timestamps
      /^\[\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.,]?\d*Z?\]\s*/i, // [timestamp]
      /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s*/i, // MM/DD/YYYY HH:MM:SS
      /^\d{2}:\d{2}:\d{2}[.,]?\d*\s*/i, // HH:MM:SS
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, // UUIDs
      /\b0x[0-9a-f]+\b/gi, // Hex addresses
      /\bpid[:\s]*\d+\b/gi, // Process IDs
      /\btid[:\s]*\d+\b/gi, // Thread IDs
      /\[\d+\]/g, // Numeric IDs in brackets
    ];

    // Categorize a line based on its content
    const categorize = (line: string): 'error' | 'warning' | 'info' | 'debug' | 'other' => {
      const lower = line.toLowerCase();
      if (/\berror\b|\bfailed\b|\bexception\b|\bcrash\b|\bfatal\b/.test(lower)) return 'error';
      if (/\bwarn(ing)?\b|\bcaution\b/.test(lower)) return 'warning';
      if (/\binfo\b/.test(lower)) return 'info';
      if (/\bdebug\b|\btrace\b|\bverbose\b/.test(lower)) return 'debug';
      return 'other';
    };

    // Process each file
    for (const file of files) {
      const lines = file.content.split('\n');
      
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const originalLine = lines[lineNum].trim();
        
        // Skip empty lines, very short lines, or purely numeric lines
        if (originalLine.length < 10 || /^\d+$/.test(originalLine)) {
          continue;
        }

        // Normalize the line
        let normalized = originalLine;
        for (const pattern of normalizePatterns) {
          normalized = normalized.replace(pattern, '');
        }
        normalized = normalized.trim().toLowerCase();

        // Skip if normalized line is too short (might have been just a timestamp)
        if (normalized.length < 10) {
          continue;
        }

        // Record this occurrence
        if (!lineMap.has(normalized)) {
          lineMap.set(normalized, {
            original: originalLine,
            occurrences: new Map(),
            category: categorize(originalLine),
          });
        }

        const entry = lineMap.get(normalized)!;
        if (!entry.occurrences.has(file.filename)) {
          entry.occurrences.set(file.filename, []);
        }
        entry.occurrences.get(file.filename)!.push(lineNum + 1); // 1-indexed line numbers
      }
    }

    // Filter to lines that appear in 2+ files
    const matches: ExactLineMatch[] = [];
    
    for (const [, entry] of lineMap) {
      if (entry.occurrences.size >= 2) {
        const occurrences = Array.from(entry.occurrences.entries()).map(([filename, lineNumbers]) => ({
          filename,
          lineNumbers: lineNumbers.slice(0, 10), // Limit line numbers shown per file
        }));
        
        const totalCount = Array.from(entry.occurrences.values())
          .reduce((sum, lines) => sum + lines.length, 0);

        matches.push({
          line: entry.original,
          occurrences,
          category: entry.category,
          totalCount,
        });
      }
    }

    // Sort by category priority (errors first) then by total count
    const categoryOrder = { error: 0, warning: 1, info: 2, debug: 3, other: 4 };
    matches.sort((a, b) => {
      const categoryDiff = categoryOrder[a.category] - categoryOrder[b.category];
      if (categoryDiff !== 0) return categoryDiff;
      return b.totalCount - a.totalCount;
    });

    // Require at least 2 matching lines before considering it a real match
    // This prevents false positives from single common log lines
    if (matches.length < 2) {
      return [];
    }

    // Limit to top 50 matches
    return matches.slice(0, 50);
  }

  /**
   * Generate an overall summary for multi-file analysis
   */
  private async generateMultiFileSummary(
    fileResults: FileAnalysisResult[],
    similarities: SimilarityResult
  ): Promise<string> {
    if (!this.session) {
      return `Analyzed ${fileResults.length} log files.`;
    }

    const summaryPrompt = `Based on the analysis of ${fileResults.length} log files, provide a concise executive summary:

Individual file summaries:
${fileResults.map((fr) => `- ${fr.filename}: ${fr.analysis.summary}`).join("\n")}

Cross-file similarities found:
- Shared patterns: ${similarities.sharedPatterns.length}
- Shared anomalies: ${similarities.sharedAnomalies.length}
- Shared root causes: ${similarities.sharedRootCauses.length}
- Correlations: ${similarities.correlations.length}

Provide a 2-3 sentence executive summary of the overall system health and key findings across all files.`;

    const response = await this.session.sendAndWait({ prompt: summaryPrompt });

    if (!response || !response.data.content) {
      return `Analyzed ${fileResults.length} log files. Found ${similarities.sharedPatterns.length} shared patterns, ${similarities.sharedAnomalies.length} shared anomalies, and ${similarities.sharedRootCauses.length} common root causes.`;
    }

    return response.data.content.trim();
  }

  /**
   * Analyze log content from a buffer (for uploaded files)
   * @param buffer The file buffer
   * @param filename Original filename for context
   * @returns Analysis results
   */
  async analyzeLogBuffer(buffer: Buffer, filename: string): Promise<LogAnalysisResult> {
    const content = buffer.toString("utf-8");
    const lines = content.split("\n");

    this.emitProgress({
      stage: "scanning",
      progress: 5,
      message: `Scanning ${filename} (${lines.length} lines)...`,
    });

    // For small content, analyze directly
    if (buffer.length <= CHUNK_SIZE) {
      this.emitProgress({
        stage: "analyzing",
        progress: 15,
        message: `Sending to AI for analysis...`,
      });

      const result = await this.analyzeLogContent(content);
      
      this.emitProgress({
        stage: "complete",
        progress: 100,
        message: "Analysis complete",
      });
      return result;
    }

    // For large content, chunk and analyze
    const chunks = this.splitIntoChunks(lines);
    const chunkResults: ChunkAnalysisResult[] = [];

    for (let i = 0; i < chunks.length; i++) {
      this.emitProgress({
        stage: "analyzing",
        progress: Math.round((i / chunks.length) * 80),
        message: `Analyzing chunk ${i + 1} of ${chunks.length}...`,
        currentChunk: i + 1,
        totalChunks: chunks.length,
      });

      const chunk = chunks[i];
      const result = await this.analyzeLogContent(chunk.content);

      chunkResults.push({
        chunkId: i,
        lineRange: chunk.lineRange,
        patterns: result.patterns,
        anomalies: result.anomalies,
        rootCauses: result.rootCauses,
      });
    }

    this.emitProgress({
      stage: "aggregating",
      progress: 85,
      message: "Aggregating results...",
    });

    const aggregatedResult = await this.aggregateChunkResults(chunkResults);

    this.emitProgress({
      stage: "complete",
      progress: 100,
      message: "Analysis complete",
    });

    return aggregatedResult;
  }

  /**
   * Analyze multiple buffers (for uploaded files)
   */
  async analyzeMultipleBuffers(
    files: { buffer: Buffer; filename: string }[]
  ): Promise<MultiFileAnalysisResult> {
    if (!this.session) {
      throw new Error("Analyzer not initialized. Call initialize() first.");
    }

    if (files.length === 0) {
      throw new Error("No files provided");
    }

    this.emitProgress({
      stage: "analyzing",
      progress: 0,
      message: `Analyzing ${files.length} files...`,
    });

    const fileResults: FileAnalysisResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const { buffer, filename } = files[i];

      this.emitProgress({
        stage: "analyzing",
        progress: Math.round((i / files.length) * 70),
        message: `Analyzing file ${i + 1} of ${files.length}: ${filename}`,
      });

      const analysis = await this.analyzeLogBuffer(buffer, filename);

      fileResults.push({
        filename,
        fileSize: buffer.length,
        analysis,
      });
    }

    this.emitProgress({
      stage: "aggregating",
      progress: 75,
      message: "Detecting similarities across files...",
    });

    const similarities = await this.findSimilarities(fileResults);

    // Find exact line matches between files
    this.emitProgress({
      stage: "aggregating",
      progress: 82,
      message: "Finding exact line matches...",
    });

    const fileContents = files.map(f => ({
      content: f.buffer.toString('utf-8'),
      filename: f.filename,
    }));
    
    similarities.exactMatches = this.findExactLineMatches(fileContents);

    this.emitProgress({
      stage: "aggregating",
      progress: 90,
      message: "Generating summary...",
    });

    const overallSummary = await this.generateMultiFileSummary(fileResults, similarities);

    this.emitProgress({
      stage: "complete",
      progress: 100,
      message: "Multi-file analysis complete",
    });

    return {
      fileResults,
      similarities,
      overallSummary,
    };
  }

  /**
   * Parse the Copilot response into structured analysis results
   */
  private parseAnalysisResponse(content: string): LogAnalysisResult {
    const result: LogAnalysisResult = {
      patterns: [],
      anomalies: [],
      rootCauses: [],
      summary: "",
    };

    const sections = {
      patterns: /##\s*PATTERNS?\s*\n?([\s\S]*?)(?=\n##|$)/i,
      anomalies: /##\s*ANOMAL(?:Y|IES)\s*\n?([\s\S]*?)(?=\n##|$)/i,
      rootCauses: /##\s*ROOT\s*CAUSES?\s*\n?([\s\S]*?)(?=\n##|$)/i,
      summary: /##\s*SUMMARY\s*\n?([\s\S]*?)$/i,
    };

    const patternsMatch = content.match(sections.patterns);
    if (patternsMatch) {
      result.patterns = this.extractListItems(patternsMatch[1]);
    }

    const anomaliesMatch = content.match(sections.anomalies);
    if (anomaliesMatch) {
      result.anomalies = this.extractListItems(anomaliesMatch[1]);
    }

    const rootCausesMatch = content.match(sections.rootCauses);
    if (rootCausesMatch) {
      result.rootCauses = this.extractListItems(rootCausesMatch[1]);
    }

    const summaryMatch = content.match(sections.summary);
    if (summaryMatch) {
      result.summary = summaryMatch[1].trim();
    }

    return result;
  }

  /**
   * Extract list items from markdown list format
   * Handles: bullet points (-, *, •), numbered lists (1. 2.), bold headers
   */
  private extractListItems(text: string): string[] {
    const lines = text.split("\n");
    const items: string[] = [];
    let currentItem = "";

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines - finalize current item
      if (!trimmed) {
        if (currentItem) {
          items.push(currentItem.trim());
          currentItem = "";
        }
        continue;
      }

      // Match bullet points: -, *, •
      const bulletMatch = trimmed.match(/^[-*•]\s*(.+)/);
      if (bulletMatch) {
        if (currentItem) {
          items.push(currentItem.trim());
        }
        currentItem = bulletMatch[1];
        continue;
      }

      // Match numbered lists: 1. 2. 3. or 1) 2) 3)
      const numberedMatch = trimmed.match(/^\d+[.)]\s*(.+)/);
      if (numberedMatch) {
        if (currentItem) {
          items.push(currentItem.trim());
        }
        currentItem = numberedMatch[1];
        continue;
      }

      // Match bold headers used as list items: **Item**: description
      const boldMatch = trimmed.match(/^\*\*(.+?)\*\*[:\s]*(.*)/);
      if (boldMatch) {
        if (currentItem) {
          items.push(currentItem.trim());
        }
        currentItem = boldMatch[2] ? `**${boldMatch[1]}**: ${boldMatch[2]}` : boldMatch[1];
        continue;
      }

      // Continuation of previous item (indented)
      if (currentItem && (line.startsWith("  ") || line.startsWith("\t"))) {
        currentItem += " " + trimmed;
        continue;
      }
      
      // Standalone line that looks like content (not a header)
      if (!currentItem && trimmed && !trimmed.startsWith("#")) {
        currentItem = trimmed;
      }
    }

    // Don't forget the last item
    if (currentItem) {
      items.push(currentItem.trim());
    }

    // Filter out placeholder text and empty items
    return items.filter(item => 
      item && 
      item.length > 0 &&
      !item.includes("[List") && 
      !item.toLowerCase().includes("list here") &&
      !item.match(/^\[.+\]$/) &&
      !item.toLowerCase().includes("none found") &&
      !item.toLowerCase().includes("no patterns") &&
      !item.toLowerCase().includes("no anomalies") &&
      !item.toLowerCase().includes("no root causes")
    );
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.session) {
      await this.session.destroy();
      this.session = null;
    }
    await this.client.stop();
  }
}
