# log-analyzer

A powerful log analyzer that parses massive log files, identifies patterns, detects anomalies, and suggests root causes using the **GitHub Copilot SDK**.

## Features

- 🔍 **Pattern Detection**: Automatically identifies recurring patterns in log files
- ⚠️ **Anomaly Detection**: Spots unusual events, errors, or behaviors
- 🎯 **Root Cause Analysis**: Suggests potential root causes for issues
- 🤖 **AI-Powered**: Leverages GitHub Copilot's AI capabilities for intelligent analysis
- 📁 **Large File Support**: Handles massive log files via file attachments
- 💻 **CLI & Programmatic API**: Use as a command-line tool or integrate into your applications

## Prerequisites

- Node.js >= 18.0.0
- [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) installed and configured
- Active GitHub Copilot subscription

## Installation

```bash
npm install
npm run build
```

## Usage

### Command Line Interface

Analyze a log file:

```bash
npm run analyze -- --file ./examples/sample-application.log
```

Or after building:

```bash
node dist/cli.js --file /path/to/your/logfile.log
```

Show help:

```bash
npm run analyze -- --help
```

### Programmatic API

You can also use the log analyzer programmatically in your Node.js applications:

```typescript
import { LogAnalyzer } from "./src/log-analyzer.js";

async function analyzeMyLogs() {
  const analyzer = new LogAnalyzer();
  
  try {
    // Initialize the analyzer
    await analyzer.initialize();
    
    // Analyze a log file
    const result = await analyzer.analyzeLogFile("./logs/app.log");
    
    console.log("Patterns:", result.patterns);
    console.log("Anomalies:", result.anomalies);
    console.log("Root Causes:", result.rootCauses);
    console.log("Summary:", result.summary);
    
    // Or analyze log content directly
    const logContent = `
      2024-01-15 08:00:01 ERROR Database connection failed
      2024-01-15 08:00:02 ERROR Database connection failed
      2024-01-15 08:00:03 ERROR Database connection failed
    `;
    const result2 = await analyzer.analyzeLogContent(logContent);
    
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

```
log-analyzer/
├── src/
│   ├── log-analyzer.ts    # Core analyzer logic
│   ├── cli.ts             # Command-line interface
│   └── index.ts           # Public API exports
├── examples/
│   └── sample-application.log  # Example log file
├── dist/                  # Compiled JavaScript (after build)
├── package.json
├── tsconfig.json
└── README.md
```

## API Reference

### LogAnalyzer

#### `initialize(): Promise<void>`
Initializes the analyzer by starting the Copilot client and creating a session.

#### `analyzeLogFile(logFilePath: string): Promise<LogAnalysisResult>`
Analyzes a log file from the filesystem.

#### `analyzeLogContent(logContent: string): Promise<LogAnalysisResult>`
Analyzes log content directly from a string.

#### `cleanup(): Promise<void>`
Cleans up resources and closes the Copilot session.

### LogAnalysisResult

```typescript
interface LogAnalysisResult {
  patterns: string[];      // Common patterns found
  anomalies: string[];     // Unusual events or errors
  rootCauses: string[];    // Potential root causes
  summary: string;         // Overall summary
}
```

## Development

Build the project:
```bash
npm run build
```

Run directly with tsx (no build needed):
```bash
npm start -- --file ./examples/sample-application.log
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
