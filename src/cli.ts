#!/usr/bin/env node

import { LogAnalyzer } from "./log-analyzer.js";
import { readFile } from "fs/promises";
import { resolve } from "path";

interface CliOptions {
  file?: string;
  help?: boolean;
}

function printUsage() {
  console.log(`
Log Analyzer - Powered by GitHub Copilot SDK

Usage:
  log-analyzer [options]

Options:
  --file <path>    Path to the log file to analyze
  --help           Show this help message

Examples:
  log-analyzer --file ./logs/application.log
  log-analyzer --file /var/log/syslog

Description:
  This tool analyzes log files using GitHub Copilot to identify patterns,
  detect anomalies, and suggest root causes for issues found in the logs.
`);
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--file" || arg === "-f") {
      options.file = args[++i];
    }
  }

  return options;
}

function printResults(result: any) {
  console.log("\n" + "=".repeat(80));
  console.log("LOG ANALYSIS RESULTS");
  console.log("=".repeat(80));

  if (result.patterns.length > 0) {
    console.log("\n📊 PATTERNS DETECTED:");
    console.log("-".repeat(80));
    result.patterns.forEach((pattern: string, idx: number) => {
      console.log(`${idx + 1}. ${pattern}`);
    });
  }

  if (result.anomalies.length > 0) {
    console.log("\n⚠️  ANOMALIES FOUND:");
    console.log("-".repeat(80));
    result.anomalies.forEach((anomaly: string, idx: number) => {
      console.log(`${idx + 1}. ${anomaly}`);
    });
  }

  if (result.rootCauses.length > 0) {
    console.log("\n🔍 ROOT CAUSES:");
    console.log("-".repeat(80));
    result.rootCauses.forEach((cause: string, idx: number) => {
      console.log(`${idx + 1}. ${cause}`);
    });
  }

  if (result.summary) {
    console.log("\n📝 SUMMARY:");
    console.log("-".repeat(80));
    console.log(result.summary);
  }

  console.log("\n" + "=".repeat(80));
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  if (!options.file) {
    console.error("Error: --file option is required\n");
    printUsage();
    process.exit(1);
  }

  const logFilePath = resolve(options.file);
  console.log(`\nAnalyzing log file: ${logFilePath}`);
  console.log("This may take a moment...\n");

  const analyzer = new LogAnalyzer();

  try {
    // Initialize the analyzer
    await analyzer.initialize();

    // Analyze the log file
    const result = await analyzer.analyzeLogFile(logFilePath);

    // Print results
    printResults(result);

    // Cleanup
    await analyzer.cleanup();
  } catch (error) {
    console.error("\nError during analysis:");
    console.error(error instanceof Error ? error.message : String(error));
    await analyzer.cleanup();
    process.exit(1);
  }
}

main();
