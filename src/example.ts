import { LogAnalyzer } from "./log-analyzer.js";

/**
 * Example demonstrating how to use the LogAnalyzer API programmatically
 */
async function exampleUsage() {
  console.log("=== Log Analyzer API Example ===\n");

  const analyzer = new LogAnalyzer();

  try {
    // Initialize the analyzer
    console.log("Initializing analyzer...");
    await analyzer.initialize();
    console.log("✓ Analyzer initialized\n");

    // Example 1: Analyze a log file
    console.log("Example 1: Analyzing a log file...");
    const fileResult = await analyzer.analyzeLogFile(
      "./examples/sample-application.log"
    );

    console.log("\n--- File Analysis Results ---");
    console.log(`Found ${fileResult.patterns.length} patterns`);
    console.log(`Found ${fileResult.anomalies.length} anomalies`);
    console.log(`Found ${fileResult.rootCauses.length} root causes`);
    console.log("\nSummary:", fileResult.summary);

    // Example 2: Analyze log content directly
    console.log("\n\nExample 2: Analyzing log content directly...");
    const logContent = `
2024-01-17 10:00:00 INFO Application started
2024-01-17 10:00:01 INFO Connected to database
2024-01-17 10:00:05 ERROR Failed to connect to cache server
2024-01-17 10:00:06 WARN Retrying cache connection...
2024-01-17 10:00:10 ERROR Failed to connect to cache server
2024-01-17 10:00:11 ERROR Application running in degraded mode
    `.trim();

    const contentResult = await analyzer.analyzeLogContent(logContent);

    console.log("\n--- Content Analysis Results ---");
    console.log("Patterns:");
    contentResult.patterns.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
    console.log("\nAnomalies:");
    contentResult.anomalies.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
    console.log("\nRoot Causes:");
    contentResult.rootCauses.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));

    // Cleanup
    console.log("\n\nCleaning up...");
    await analyzer.cleanup();
    console.log("✓ Cleanup complete");
  } catch (error) {
    console.error("\nError during analysis:");
    console.error(error instanceof Error ? error.message : String(error));
    await analyzer.cleanup();
    process.exit(1);
  }
}

// Run the example
exampleUsage();
