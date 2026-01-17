/**
 * Result of analyzing a single log file
 */
export interface LogAnalysisResult {
  patterns: string[];
  anomalies: string[];
  rootCauses: string[];
  summary: string;
}

/**
 * Result of analyzing a single chunk of a large log file
 */
export interface ChunkAnalysisResult {
  chunkId: number;
  lineRange: { start: number; end: number };
  patterns: string[];
  anomalies: string[];
  rootCauses: string[];
}

/**
 * Result of analyzing multiple log files with similarity detection
 */
export interface MultiFileAnalysisResult {
  /** Analysis results for each individual file */
  fileResults: FileAnalysisResult[];
  /** Patterns that appear across multiple files */
  similarities: SimilarityResult;
  /** Overall summary of all files */
  overallSummary: string;
}

/**
 * Analysis result for a single file in multi-file analysis
 */
export interface FileAnalysisResult {
  filename: string;
  fileSize: number;
  analysis: LogAnalysisResult;
}

/**
 * Similarities found across multiple log files
 */
export interface SimilarityResult {
  /** Patterns that appear in multiple files */
  sharedPatterns: string[];
  /** Anomalies that appear in multiple files */
  sharedAnomalies: string[];
  /** Root causes that appear in multiple files */
  sharedRootCauses: string[];
  /** Correlated events across files (e.g., timestamps align) */
  correlations: string[];
  /** Exact line matches found between files */
  exactMatches?: ExactLineMatch[];
}

/**
 * An exact line match found between multiple files
 */
export interface ExactLineMatch {
  /** The matching line content (normalized) */
  line: string;
  /** Files and line numbers where this match appears */
  occurrences: {
    filename: string;
    lineNumbers: number[];
  }[];
  /** Category of the match (error, warning, info, etc.) */
  category: 'error' | 'warning' | 'info' | 'debug' | 'other';
  /** Number of times this line appears total */
  totalCount: number;
}

/**
 * AI-generated suggestions for GitHub issue searches
 */
export interface IssueSuggestion {
  /** The error signature this suggestion is based on */
  errorSignature: string;
  /** Suggested GitHub search query */
  searchQuery: string;
  /** Human-readable description */
  description: string;
  /** Potential solutions from AI knowledge */
  potentialSolutions: string[];
  /** Actual GitHub issues found matching this error */
  linkedIssues?: GitHubIssue[];
  /** Files that contributed to this issue suggestion */
  sourceFiles?: string[];
}

/**
 * A GitHub issue fetched from the API
 */
export interface GitHubIssue {
  /** Issue number */
  number: number;
  /** Issue title */
  title: string;
  /** Issue URL */
  url: string;
  /** Issue state (open/closed) */
  state: "open" | "closed";
  /** Repository in owner/repo format */
  repository: string;
  /** Number of comments */
  comments: number;
  /** Created date ISO string */
  createdAt: string;
  /** Labels on the issue */
  labels: string[];
}

/**
 * Progress update during analysis
 */
export interface AnalysisProgress {
  stage: "uploading" | "scanning" | "analyzing" | "aggregating" | "complete" | "error";
  progress: number; // 0-100
  message: string;
  currentChunk?: number;
  totalChunks?: number;
  /** Streaming AI reasoning text */
  streamingText?: string;
}

/**
 * Request to analyze a single file
 */
export interface AnalyzeRequest {
  /** The repository to search issues in (owner/repo format) */
  githubRepo?: string;
  /** Whether to include issue suggestions */
  includeIssueSuggestions?: boolean;
}

/**
 * Request to analyze multiple files
 */
export interface AnalyzeMultiRequest extends AnalyzeRequest {
  /** Whether to detect similarities across files */
  detectSimilarities?: boolean;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * File metadata from upload
 */
export interface UploadedFile {
  filename: string;
  originalName: string;
  size: number;
  path: string;
  mimeType: string;
}
