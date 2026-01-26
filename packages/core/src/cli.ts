#!/usr/bin/env node

import { LogAnalyzer } from "./log-analyzer.js";
import { IssueSuggester } from "./issue-suggester.js";
import { resolve, dirname, basename, join } from "path";
import { readdirSync, statSync, readFileSync } from "fs";
import type {
  LogAnalysisResult,
  MultiFileAnalysisResult,
  IssueSuggestion,
  AnalysisProgress,
} from "@log-analyzer/shared";

interface CliOptions {
  files: string[];
  help?: boolean;
  suggestIssues?: boolean;
  repo?: string;
}

/**
 * Simple glob pattern matching for log files
 * Supports basic patterns like "*.log", "logs/*.txt"
 */
function expandGlobPattern(pattern: string): string[] {
  const dir = dirname(pattern);
  const filePattern = basename(pattern);
  
  // Convert glob pattern to regex with proper escaping to prevent ReDoS
  // First escape all special regex characters except * and ?
  const escapedPattern = filePattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&");
  
  // Now safely replace glob wildcards with regex equivalents
  // Use non-greedy matching to prevent catastrophic backtracking
  const regexPattern = escapedPattern
    .replace(/\*/g, "[^/]*?")  // * matches any characters except path separator (non-greedy)
    .replace(/\?/g, "[^/]");   // ? matches single character except path separator
  
  const regex = new RegExp(`^${regexPattern}$`);
  
  try {
    const resolvedDir = resolve(dir);
    const files = readdirSync(resolvedDir);
    return files
      .filter(file => regex.test(file))
      .map(file => join(resolvedDir, file))
      .filter(file => {
        try {
          return statSync(file).isFile();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

function printUsage() {
  console.log(`
Log Analyzer - Powered by GitHub Copilot SDK

Usage:
  log-analyzer [options]

Options:
  --file <path>         Path to a log file to analyze (can be used multiple times)
  --files <pattern>     Glob pattern to match multiple log files (e.g., "logs/*.log")
  --suggest-issues      Generate GitHub issue search suggestions based on findings
  --repo <owner/repo>   Repository to scope issue searches to
  --help                Show this help message

Examples:
  # Analyze a single file
  log-analyzer --file ./logs/application.log

  # Analyze multiple files and find similarities
  log-analyzer --file ./logs/app.log --file ./logs/error.log

  # Analyze with glob pattern
  log-analyzer --files "logs/*.log"

  # Include issue suggestions
  log-analyzer --file ./logs/app.log --suggest-issues --repo microsoft/vscode

Description:
  This tool analyzes log files using GitHub Copilot to identify patterns,
  detect anomalies, suggest root causes, and find similarities across files.
`);
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    files: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--file" || arg === "-f") {
      const file = args[++i];
      if (file) {
        options.files.push(resolve(file));
      }
    } else if (arg === "--files") {
      const pattern = args[++i];
      if (pattern) {
        // Use simple glob expansion
        const matches = expandGlobPattern(pattern);
        if (matches.length > 0) {
          options.files.push(...matches);
        } else {
          // If no matches, treat as single file
          options.files.push(resolve(pattern));
        }
      }
    } else if (arg === "--suggest-issues") {
      options.suggestIssues = true;
    } else if (arg === "--repo") {
      options.repo = args[++i];
    }
  }

  return options;
}

function printProgress(progress: AnalysisProgress) {
  const progressBar = createProgressBar(progress.progress);
  process.stdout.write(`\r${progressBar} ${progress.message.padEnd(50)}`);
  if (progress.stage === "complete" || progress.stage === "error") {
    console.log();
  }
}

function createProgressBar(percent: number): string {
  const width = 30;
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${percent.toString().padStart(3)}%`;
}

function printSingleFileResults(result: LogAnalysisResult) {
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

function printMultiFileResults(result: MultiFileAnalysisResult) {
  console.log("\n" + "=".repeat(80));
  console.log("MULTI-FILE ANALYSIS RESULTS");
  console.log("=".repeat(80));

  // Print individual file results
  for (const fileResult of result.fileResults) {
    console.log(`\n📁 ${fileResult.filename} (${(fileResult.fileSize / 1024).toFixed(1)} KB)`);
    console.log("-".repeat(80));

    if (fileResult.analysis.patterns.length > 0) {
      console.log("  📊 Patterns:", fileResult.analysis.patterns.slice(0, 3).join("; "));
    }
    if (fileResult.analysis.anomalies.length > 0) {
      console.log("  ⚠️  Anomalies:", fileResult.analysis.anomalies.slice(0, 3).join("; "));
    }
    if (fileResult.analysis.rootCauses.length > 0) {
      console.log("  🔍 Root Causes:", fileResult.analysis.rootCauses.slice(0, 3).join("; "));
    }
  }

  // Print similarities
  console.log("\n" + "=".repeat(80));
  console.log("CROSS-FILE SIMILARITIES");
  console.log("=".repeat(80));

  if (result.similarities.sharedPatterns.length > 0) {
    console.log("\n🔗 SHARED PATTERNS:");
    result.similarities.sharedPatterns.forEach((pattern, idx) => {
      console.log(`${idx + 1}. ${pattern}`);
    });
  }

  if (result.similarities.sharedAnomalies.length > 0) {
    console.log("\n🔗 SHARED ANOMALIES:");
    result.similarities.sharedAnomalies.forEach((anomaly, idx) => {
      console.log(`${idx + 1}. ${anomaly}`);
    });
  }

  if (result.similarities.sharedRootCauses.length > 0) {
    console.log("\n🔗 SHARED ROOT CAUSES:");
    result.similarities.sharedRootCauses.forEach((cause, idx) => {
      console.log(`${idx + 1}. ${cause}`);
    });
  }

  if (result.similarities.correlations.length > 0) {
    console.log("\n🔗 CORRELATIONS:");
    result.similarities.correlations.forEach((correlation, idx) => {
      console.log(`${idx + 1}. ${correlation}`);
    });
  }

  // Print overall summary
  console.log("\n📝 OVERALL SUMMARY:");
  console.log("-".repeat(80));
  console.log(result.overallSummary);

  console.log("\n" + "=".repeat(80));
}

function printIssueSuggestions(suggestions: IssueSuggestion[]) {
  if (suggestions.length === 0) {
    console.log("\n💡 No issue suggestions generated.");
    return;
  }

  console.log("\n" + "=".repeat(80));
  console.log("GITHUB ISSUE SUGGESTIONS");
  console.log("=".repeat(80));

  suggestions.forEach((suggestion, idx) => {
    console.log(`\n${idx + 1}. ${suggestion.errorSignature}`);
    console.log("-".repeat(80));
    console.log(`   📋 ${suggestion.description}`);
    console.log(`   🔍 Search: ${suggestion.searchQuery}`);
    
    // Show linked GitHub issues if found
    if (suggestion.linkedIssues && suggestion.linkedIssues.length > 0) {
      console.log("   🔗 Related GitHub Issues:");
      suggestion.linkedIssues.forEach((issue) => {
        const stateIcon = issue.state === "open" ? "🟢" : "🟣";
        console.log(`      ${stateIcon} #${issue.number} - ${issue.title}`);
        console.log(`         ${issue.url}`);
      });
    } else {
      console.log("   ℹ️  No matching GitHub issues found");
    }
    
    if (suggestion.potentialSolutions.length > 0) {
      console.log("   💡 Potential solutions:");
      suggestion.potentialSolutions.forEach((sol) => {
        console.log(`      • ${sol}`);
      });
    }
  });

  console.log("\n" + "=".repeat(80));
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  if (options.files.length === 0) {
    console.error("Error: At least one log file is required\n");
    printUsage();
    process.exit(1);
  }

  console.log(`\nAnalyzing ${options.files.length} log file(s)...`);
  options.files.forEach((f) => console.log(`  • ${f}`));
  console.log();

  const analyzer = new LogAnalyzer();
  let suggester: IssueSuggester | null = null;

  // Set up progress listener
  analyzer.on("progress", printProgress);

  try {
    await analyzer.initialize();

    let analysisResult: LogAnalysisResult | MultiFileAnalysisResult;

    if (options.files.length === 1) {
      // Single file analysis
      analysisResult = await analyzer.analyzeLogFile(options.files[0]);
      printSingleFileResults(analysisResult);
    } else {
      // Multi-file analysis
      analysisResult = await analyzer.analyzeMultipleLogFiles(options.files);
      printMultiFileResults(analysisResult as MultiFileAnalysisResult);
    }

    // Generate issue suggestions if requested
    if (options.suggestIssues) {
      console.log("\nGenerating issue suggestions...");
      suggester = new IssueSuggester();
      await suggester.initialize();

      // Get the primary analysis result for suggestions
      const primaryResult =
        options.files.length === 1
          ? (analysisResult as LogAnalysisResult)
          : (analysisResult as MultiFileAnalysisResult).fileResults[0].analysis;

      // Read raw file content for exact text matching
      const rawLogContent = options.files
        .map(f => readFileSync(f, 'utf-8'))
        .join('\n\n---FILE SEPARATOR---\n\n');

      const suggestions = await suggester.suggestIssues(primaryResult, options.repo, true, rawLogContent);
      printIssueSuggestions(suggestions);
    }

    // Cleanup
    await analyzer.cleanup();
    if (suggester) {
      await suggester.cleanup();
    }
  } catch (error) {
    console.error("\nError during analysis:");
    console.error(error instanceof Error ? error.message : String(error));
    await analyzer.cleanup();
    if (suggester) {
      await suggester.cleanup();
    }
    process.exit(1);
  }
}

main();
