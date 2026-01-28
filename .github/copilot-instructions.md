# Log Analyzer - Copilot Instructions

## Project Overview
This is a log analysis tool designed to parse, analyze, and extract insights from various log formats.

## Code Style Guidelines
- Use TypeScript for type safety
- Follow functional programming patterns where appropriate
- Write descriptive variable names that reflect log analysis context
- Include JSDoc comments for public APIs
- Handle errors gracefully with meaningful error messages

## Log Parsing Conventions
- Support common log formats: Apache, Nginx, JSON, syslog
- Use streaming for large log files to manage memory
- Implement parsers as composable, testable units
- Validate log entries before processing

## Testing Requirements
- Write unit tests for all parser functions
- Include sample log files in test fixtures
- Test edge cases: malformed logs, empty files, encoding issues

## Performance Considerations
- Optimize for large file processing
- Use async/await for I/O operations
- Consider memory usage when processing logs