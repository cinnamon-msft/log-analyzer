# Add Log Parser

Create a new log parser for the specified format in the log-analyzer project.

## Log Format to Parse
{{format}}

## Implementation Requirements

### 1. Type Definitions
Add types to `packages/shared/src/types.ts`:

```typescript
/**
 * Parsed log entry for [FORMAT_NAME]
 */
export interface [FormatName]LogEntry {
  timestamp: Date;
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  // Add format-specific fields
  metadata?: Record<string, unknown>;
  raw: string; // Original log line
}
```

### 2. Parser Implementation
Create `packages/core/src/parsers/[format-name]-parser.ts`:

```typescript
import { createReadStream } from "fs";
import { createInterface } from "readline";

export interface [FormatName]ParserOptions {
  /** Skip malformed entries instead of throwing */
  skipMalformed?: boolean;
  /** Custom timestamp parser */
  parseTimestamp?: (ts: string) => Date;
}

export class [FormatName]Parser {
  private options: Required<[FormatName]ParserOptions>;

  constructor(options: [FormatName]ParserOptions = {}) {
    this.options = {
      skipMalformed: options.skipMalformed ?? true,
      parseTimestamp: options.parseTimestamp ?? this.defaultTimestampParser,
    };
  }

  /**
   * Parse a single log line
   */
  parseLine(line: string): [FormatName]LogEntry | null {
    // Implement regex/parsing logic here
    // Return null for malformed entries if skipMalformed is true
  }

  /**
   * Stream parse a large log file
   */
  async *parseFile(filePath: string): AsyncGenerator<[FormatName]LogEntry> {
    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      const entry = this.parseLine(line);
      if (entry) yield entry;
    }
  }

  private defaultTimestampParser(ts: string): Date {
    return new Date(ts);
  }
}
```

### 3. Error Handling
- Return `null` for unparseable lines when `skipMalformed: true`
- Emit warnings for malformed entries (don't fail silently)
- Validate required fields are present
- Handle encoding issues gracefully

### 4. Streaming Support
- Use `readline` with `createReadStream` for line-by-line processing
- Support backpressure for memory efficiency
- Use async generators for composability
- Handle files larger than `CHUNK_SIZE` (500KB)

### 5. Export from Package
Update `packages/core/src/index.ts`:

```typescript
export { [FormatName]Parser } from "./parsers/[format-name]-parser.js";
export type { [FormatName]LogEntry, [FormatName]ParserOptions } from "@log-analyzer/shared";
```

### 6. Unit Tests
Create `packages/core/src/parsers/__tests__/[format-name]-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { [FormatName]Parser } from '../[format-name]-parser';

describe('[FormatName]Parser', () => {
  it('should parse valid log lines', () => {
    const parser = new [FormatName]Parser();
    const entry = parser.parseLine('...');
    expect(entry).toMatchObject({ /* expected fields */ });
  });

  it('should handle malformed entries gracefully', () => {
    const parser = new [FormatName]Parser({ skipMalformed: true });
    expect(parser.parseLine('invalid')).toBeNull();
  });

  it('should stream large files', async () => {
    const parser = new [FormatName]Parser();
    const entries = [];
    for await (const entry of parser.parseFile('fixtures/sample.log')) {
      entries.push(entry);
    }
    expect(entries.length).toBeGreaterThan(0);
  });
});
```

### 7. Test Fixtures
Add sample log files to `packages/core/src/parsers/__tests__/fixtures/`:
- `valid-[format].log` - Normal log entries
- `malformed-[format].log` - Edge cases and errors
- `large-[format].log` - Performance testing (optional)

## Common Log Format Examples

### Apache Combined Log
```
127.0.0.1 - - [10/Oct/2023:13:55:36 -0700] "GET /index.html HTTP/1.1" 200 2326 "-" "Mozilla/5.0"
```

### JSON Structured Log
```json
{"timestamp":"2023-10-10T13:55:36Z","level":"info","message":"Request processed","requestId":"abc123"}
```

### Syslog
```
Oct 10 13:55:36 hostname application[1234]: Message content here
```