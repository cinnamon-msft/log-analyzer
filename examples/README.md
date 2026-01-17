# Log Analyzer Demo

This directory contains example log files that demonstrate the log analyzer's capabilities.

## Example Files

### 1. sample-application.log
A typical web application log showing:
- **Payment processor failures**: Multiple connection refused errors
- **Database issues**: Connection timeouts and pool exhaustion
- **Security incidents**: Brute force attack attempts and SQL injection
- **Performance issues**: High memory usage and query timeouts
- **Normal operations**: Successful API calls and automated backups

### 2. ecommerce-platform.log
An e-commerce platform log demonstrating:
- **Payment gateway timeouts**: Recurring Stripe API connection issues
- **Rate limiting**: IP address blocked for excessive requests
- **Database deadlocks**: Transaction rollbacks due to deadlocks
- **Security alerts**: Brute force attack detection and blocking
- **Infrastructure issues**: Redis connection loss, S3 upload failures
- **Performance monitoring**: Slow queries, memory usage, connection pool scaling

## Expected Analysis Output

When analyzing these logs, the log analyzer should identify:

### Patterns
- Regular API endpoint access patterns
- Scheduled backup processes
- Health check intervals
- Normal transaction flows
- User authentication patterns

### Anomalies
- Payment processor complete unavailability
- Database connection pool exhaustion
- Multiple failed login attempts from same user/IP
- SQL injection attempts
- High memory usage spikes
- Rate limiting violations
- Database deadlocks
- S3 access permission issues

### Root Causes
- Payment service down or network issues preventing communication
- Database connection pool too small for load
- Brute force attack attempt on authentication system
- Insufficient indexing on database tables causing slow queries
- Memory leak or inefficient resource management
- AWS permissions misconfigured for S3 bucket
- Database transaction conflicts requiring better isolation

### Summary
The logs would typically show a system under stress with multiple critical issues:
1. **Immediate action required**: Payment gateway connectivity
2. **Security concerns**: Active attack attempts requiring monitoring
3. **Performance issues**: Database optimization needed
4. **Infrastructure**: Scaling and configuration adjustments recommended

## Running the Analyzer

To analyze these files:

```bash
# Using the CLI
npm run analyze -- --file ./examples/sample-application.log
npm run analyze -- --file ./examples/ecommerce-platform.log

# Or directly
node dist/cli.js --file ./examples/sample-application.log
node dist/cli.js --file ./examples/ecommerce-platform.log
```

## Creating Your Own Test Logs

When testing the analyzer with your own logs, ensure they include:
- Timestamps
- Log levels (INFO, WARN, ERROR, CRITICAL)
- Component/module names
- Meaningful error messages
- Context for failures (IDs, user info, etc.)

The more context and structure in your logs, the better the AI can identify patterns and root causes.
