# Log Analyzer

A powerful log analyzer with **web UI** that parses massive log files, identifies patterns, detects anomalies, finds similarities across files, and suggests GitHub issues—all powered by the **GitHub Copilot SDK**.

## Features

- 🔍 **Pattern Detection**: Automatically identifies recurring patterns in log files
- ⚠️ **Anomaly Detection**: Spots unusual events, errors, or behaviors
- 🎯 **Root Cause Analysis**: Suggests potential root causes for issues
- 🤖 **AI-Powered**: Leverages GitHub Copilot's AI capabilities for intelligent analysis
- 📁 **Large File Support**: Handles massive log files with chunked streaming analysis
- 🔗 **Multi-File Comparison**: Analyze multiple logs and find similarities/correlations
- 💡 **GitHub Issue Suggestions**: AI-generated search queries to find related issues
- 🌐 **Web UI**: Modern React-based interface for easy analysis
- 💻 **CLI & Programmatic API**: Use as a command-line tool or integrate into your applications
- 🔒 **Secure**: Memory-only file processing, rate limiting, and input sanitization

## Prerequisites

- Node.js >= 18.0.0
- [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) installed and configured
- Active GitHub Copilot subscription

## Installation

```bash
npm install
npm run build
```

## Quick Start

### Web UI (Recommended)

Start both the API server and React frontend:

```bash
npm run dev
```

Then open http://localhost:5173 in your browser.

### Command Line Interface

Analyze a single log file:

```bash
npm run cli -- --file ./examples/sample-application.log
```

Analyze multiple files with similarity detection:

```bash
npm run cli -- --file ./logs/app.log --file ./logs/error.log --file ./logs/access.log
```

Use glob patterns:

```bash
npm run cli -- --files "logs/*.log"
```

Include GitHub issue suggestions:

```bash
npm run cli -- --file ./logs/error.log --suggest-issues --repo microsoft/vscode
```

Show help:

```bash
npm run cli -- --help
```

### Programmatic API

You can also use the log analyzer programmatically in your Node.js applications:

```typescript
import { LogAnalyzer, IssueSuggester } from "@log-analyzer/core";

async function analyzeMyLogs() {
  const analyzer = new LogAnalyzer();
  
  try {
    // Initialize the analyzer
    await analyzer.initialize();
    
    // Listen for progress updates
    analyzer.on("progress", (progress) => {
      console.log(`${progress.stage}: ${progress.progress}% - ${progress.message}`);
    });
    
    // Analyze a single log file
    const result = await analyzer.analyzeLogFile("./logs/app.log");
    console.log("Patterns:", result.patterns);
    console.log("Anomalies:", result.anomalies);
    console.log("Root Causes:", result.rootCauses);
    console.log("Summary:", result.summary);
    
    // Analyze multiple files with similarity detection
    const multiResult = await analyzer.analyzeMultipleLogFiles([
      "./logs/app.log",
      "./logs/error.log",
      "./logs/access.log"
    ]);
    console.log("Shared patterns:", multiResult.similarities.sharedPatterns);
    console.log("Correlations:", multiResult.similarities.correlations);
    
    // Generate GitHub issue suggestions
    const suggester = new IssueSuggester();
    await suggester.initialize();
    const suggestions = await suggester.suggestIssues(result, "owner/repo");
    console.log("Issue suggestions:", suggestions);
    await suggester.cleanup();
    
    // Cleanup
    await analyzer.cleanup();
  } catch (error) {
    console.error("Analysis failed:", error);
    await analyzer.cleanup();
  }
}

analyzeMyLogs();
```

## Example Output

```
================================================================================
LOG ANALYSIS RESULTS
================================================================================

📊 PATTERNS DETECTED:
--------------------------------------------------------------------------------
1. Repeated API calls to /api/users, /api/products, and /api/orders endpoints
2. Regular successful responses (200 OK, 201 Created) indicating normal operation
3. Multiple payment processor failures occurring consistently every 5 seconds
4. Database connection issues followed by retry attempts
5. Periodic automated backup processes

⚠️  ANOMALIES FOUND:
--------------------------------------------------------------------------------
1. Payment processor completely unavailable - multiple connection refused errors
2. Database query timeouts on orders table
3. Connection pool exhaustion (100 connections limit reached)
4. Multiple failed login attempts from user@test.com leading to account lockout
5. SQL injection attempt detected from IP 192.168.1.100
6. High memory usage spike (85% RAM utilization)

🔍 ROOT CAUSES:
--------------------------------------------------------------------------------
1. Payment service is down or unreachable - requires immediate investigation
2. Database performance degradation likely due to connection pool exhaustion
3. Potential brute force attack on authentication system
4. Memory leak or inefficient garbage collection causing high RAM usage
5. Orders table query needs optimization or indexing

📝 SUMMARY:
--------------------------------------------------------------------------------
The system is experiencing critical issues with the payment processor being
completely unavailable, causing all payment transactions to fail. Database
performance is degraded due to connection pool exhaustion. Security concerns
include a brute force login attempt and a SQL injection attempt. Memory usage
is high but was addressed by garbage collection. Immediate action required on
payment service restoration and database optimization.

================================================================================
```

## Architecture

The log analyzer uses the GitHub Copilot SDK to communicate with the Copilot CLI:

```
Log Analyzer
     ↓
Copilot SDK
     ↓ JSON-RPC
Copilot CLI
     ↓
GitHub Copilot AI
```

The analyzer:
1. Accepts log files or log content as input
2. Sends the logs to GitHub Copilot with structured prompts
3. Receives AI-powered analysis
4. Parses and structures the results
5. Presents findings in an easy-to-read format

## Project Structure

This project uses npm workspaces for a clean monorepo structure:

```
log-analyzer/
├── packages/
│   ├── shared/              # Shared types and utilities
│   │   └── src/
│   │       ├── types.ts     # TypeScript interfaces
│   │       └── sanitize.ts  # Security utilities
│   ├── core/                # Core analysis engine
│   │   └── src/
│   │       ├── log-analyzer.ts    # Main analyzer class
│   │       ├── issue-suggester.ts # GitHub issue suggestions
│   │       └── cli.ts             # Command-line interface
│   ├── server/              # Express API server
│   │   └── src/
│   │       ├── routes/      # API endpoints
│   │       └── middleware/  # Security & upload handling
│   └── web/                 # React frontend
│       └── src/
│           ├── components/  # React components
│           └── hooks/       # Custom hooks
├── examples/
│   └── sample-application.log
├── package.json             # Workspace root
└── README.md
```

## API Reference

### LogAnalyzer

#### `initialize(): Promise<void>`
Initializes the analyzer by starting the Copilot client and creating a session.

#### `analyzeLogFile(logFilePath: string): Promise<LogAnalysisResult>`
Analyzes a log file from the filesystem. Automatically uses chunked analysis for large files.

#### `analyzeLogContent(logContent: string): Promise<LogAnalysisResult>`
Analyzes log content directly from a string.

#### `analyzeMultipleLogFiles(logFilePaths: string[]): Promise<MultiFileAnalysisResult>`
Analyzes multiple log files and finds similarities between them.

#### `analyzeLogBuffer(buffer: Buffer, filename: string): Promise<LogAnalysisResult>`
Analyzes log content from a buffer (used by the web API for uploads).

#### `cleanup(): Promise<void>`
Cleans up resources and closes the Copilot session.

### IssueSuggester

#### `initialize(): Promise<void>`
Initializes the suggester with a Copilot session.

#### `suggestIssues(analysisResult: LogAnalysisResult, repository?: string): Promise<IssueSuggestion[]>`
Generates GitHub issue search suggestions based on analysis results.

#### `generateSearchUrl(errorMessage: string, repository?: string): string`
Generates a GitHub search URL for a specific error.

### Types

```typescript
interface LogAnalysisResult {
  patterns: string[];      // Common patterns found
  anomalies: string[];     // Unusual events or errors
  rootCauses: string[];    // Potential root causes
  summary: string;         // Overall summary
}

interface MultiFileAnalysisResult {
  fileResults: FileAnalysisResult[];  // Per-file results
  similarities: SimilarityResult;      // Cross-file patterns
  overallSummary: string;              // Combined summary
}

interface SimilarityResult {
  sharedPatterns: string[];    // Patterns in multiple files
  sharedAnomalies: string[];   // Anomalies in multiple files
  sharedRootCauses: string[];  // Common root causes
  correlations: string[];      // Correlated events
}

interface IssueSuggestion {
  errorSignature: string;       // Key error identifier
  searchQuery: string;          // GitHub search query
  description: string;          // Human-readable description
  potentialSolutions: string[]; // AI-suggested fixes
}
```

## REST API Endpoints

When running the server (`npm run dev:server`):

### POST /api/analyze
Analyze a single log file.

**Request:** `multipart/form-data` with `file` field

**Response:**
```json
{
  "success": true,
  "data": {
    "analysis": { "patterns": [], "anomalies": [], "rootCauses": [], "summary": "" },
    "issueSuggestions": [],
    "filename": "app.log",
    "fileSize": 1024
  }
}
```

### POST /api/analyze/multi
Analyze multiple log files with similarity detection.

**Request:** `multipart/form-data` with `files` field (multiple files)

**Response:**
```json
{
  "success": true,
  "data": {
    "analysis": {
      "fileResults": [],
      "similarities": { "sharedPatterns": [], "correlations": [] },
      "overallSummary": ""
    },
    "issueSuggestions": []
  }
}
```

### GET /api/health
Health check endpoint.

## Security

The log analyzer implements several security measures:

- **Memory-only processing**: Uploaded files are stored in memory buffers, never written to disk
- **Content sanitization**: All log content is HTML-escaped before display to prevent XSS
- **File validation**: Only `.log`, `.txt`, and `.json` files are accepted
- **Rate limiting**: API endpoints are rate-limited to 30 requests/minute
- **Path traversal prevention**: Filenames are validated to prevent directory traversal attacks
- **Security headers**: CORS, CSP, and other security headers are configured

## Development

Build all packages:
```bash
npm run build
```

Run in development mode (server + web):
```bash
npm run dev
```

Run only the API server:
```bash
npm run dev:server
```

Run only the React app:
```bash
npm run dev:web
```

Type check all packages:
```bash
npm run typecheck
```

## How It Works

1. **File Attachment**: Large log files are sent to Copilot as file attachments, allowing analysis of massive logs without token limitations
2. **Structured Prompts**: The analyzer uses carefully crafted prompts to guide Copilot's analysis
3. **Intelligent Parsing**: Results are parsed from Copilot's response into structured data
4. **Pattern Recognition**: Copilot's AI identifies recurring patterns and correlations
5. **Anomaly Detection**: Unusual events are flagged based on context and frequency
6. **Root Cause Analysis**: Copilot suggests potential root causes by analyzing error patterns and sequences

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Acknowledgments

This project uses the [GitHub Copilot SDK](https://github.com/github/copilot-sdk) to provide AI-powered log analysis capabilities.
