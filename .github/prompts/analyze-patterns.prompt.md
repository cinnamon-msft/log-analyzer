# Analyze Log Patterns

Analyze logs to identify patterns, anomalies, or specific events using the log-analyzer project.

## Target Logs or Patterns
{{target}}

## Analysis Capabilities

This project uses AI-powered analysis via the Copilot SDK to detect:

### Patterns
- **Error patterns**: Recurring error messages, exception types, stack trace signatures
- **Traffic patterns**: Request rates, endpoint usage, user behavior flows
- **Temporal patterns**: Time-based spikes, periodic events, off-hours activity
- **Resource patterns**: Memory usage trends, connection pools, thread utilization

### Anomalies
- **Unusual activity**: Deviations from baseline behavior
- **Error spikes**: Sudden increases in error rates
- **Performance degradation**: Increased response times, timeouts
- **Security events**: Failed authentications, unusual access patterns

### Metrics to Extract
- Response times (p50, p95, p99)
- HTTP status code distribution
- Error rates by type/endpoint
- Request volumes over time
- Resource utilization metrics

## How to Use the Analyzer

### Single File Analysis
```typescript
import { LogAnalyzer } from "@log-analyzer/core";

const analyzer = new LogAnalyzer({ model: "gpt-4o" });
await analyzer.initialize();

const result = await analyzer.analyzeLogFile("path/to/logfile.log");
console.log(result.patterns, result.anomalies, result.rootCauses);
```

### Multi-File Analysis with Similarity Detection
```typescript
const result = await analyzer.analyzeMultipleLogFiles([
  "server.log",
  "application.log",
  "error.log"
]);
console.log(result.similarities.sharedPatterns);
```

### Progress Tracking
```typescript
analyzer.on("progress", (progress) => {
  console.log(`${progress.stage}: ${progress.progress}% - ${progress.message}`);
});
```

## Output Format
Results follow the `LogAnalysisResult` interface from `@log-analyzer/shared`:
- `patterns: string[]` - Identified patterns
- `anomalies: string[]` - Detected anomalies
- `rootCauses: string[]` - Potential root causes
- `summary: string` - Overall analysis summary

## Supported Log Formats
- Apache/Nginx access logs
- JSON-structured logs
- Syslog format
- Application logs with timestamps
- Custom formats (parsed line-by-line)