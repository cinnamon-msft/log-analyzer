# Debug Log Issue

Help debug an issue in the log-analyzer project using log analysis techniques.

## Issue Description
{{issue_description}}

## Project Context
This is a TypeScript monorepo with the following packages:
- `packages/core` - Core log analysis logic using the Copilot SDK (`LogAnalyzer`, `IssueSuggester`)
- `packages/server` - Express server with file upload and analysis API routes
- `packages/shared` - Shared types (`LogAnalysisResult`, `AnalysisProgress`, etc.)
- `packages/web` - React frontend with Vite

## Debugging Steps

### 1. Identify Relevant Log Entries
- Look for error messages, stack traces, and exception patterns
- Search for timestamps around the reported issue time
- Filter by log level (ERROR, WARN) to find critical entries
- Check for correlation IDs or request IDs to trace request flows

### 2. Trace the Sequence of Events
- Reconstruct the timeline leading up to the error
- Identify which component/package originated the issue
- Check for cascading failures across packages
- Look for timeout patterns or resource exhaustion

### 3. Analyze Root Cause Indicators
For this project, common root causes include:
- Copilot SDK connection issues (`CopilotClient`, `CopilotSession`)
- Large file chunking problems (check `CHUNK_SIZE`, `MAX_LINES_PER_CHUNK`)
- Memory issues with streaming/buffering
- File upload middleware errors (`multer` configuration)
- CORS or security middleware blocking requests

### 4. Key Files to Check
- [packages/core/src/log-analyzer.ts](packages/core/src/log-analyzer.ts) - Main analysis logic
- [packages/server/src/routes/analyze.ts](packages/server/src/routes/analyze.ts) - API endpoints
- [packages/server/src/middleware/error-handler.ts](packages/server/src/middleware/error-handler.ts) - Error handling
- [packages/web/src/hooks/useLogAnalysis.ts](packages/web/src/hooks/useLogAnalysis.ts) - Frontend state

### 5. Suggest Fixes
Based on the root cause:
- Provide code snippets for the fix
- Reference similar patterns already in the codebase
- Add appropriate error handling and logging
- Include unit test cases for the fix