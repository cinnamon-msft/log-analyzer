import { CopilotClient, CopilotSession } from "@github/copilot-sdk";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

export interface LogAnalysisResult {
  patterns: string[];
  anomalies: string[];
  rootCauses: string[];
  summary: string;
}

/**
 * Resolves the path to the copilot CLI binary.
 * This ensures we use an absolute path which works correctly on all platforms,
 * including Windows where the default "copilot" command may not be found.
 */
function resolveCopilotCliPath(): string {
  // Locate the @github/copilot-sdk package, then navigate to the sibling @github/copilot package
  const copilotSdkPath = import.meta.resolve("@github/copilot-sdk");
  const sdkDir = dirname(fileURLToPath(copilotSdkPath));
  // Navigate from sdk/dist to @github/copilot/npm-loader.js
  return join(sdkDir, "..", "..", "copilot", "npm-loader.js");
}

export class LogAnalyzer {
  private client: CopilotClient;
  private session: CopilotSession | null = null;

  constructor() {
    this.client = new CopilotClient({
      cliPath: resolveCopilotCliPath(),
    });
  }

  /**
   * Initialize the analyzer by starting the Copilot client and creating a session
   */
  async initialize(): Promise<void> {
    await this.client.start();
    this.session = await this.client.createSession({
      model: "gpt-4o",
    });
  }

  /**
   * Analyze a log file to identify patterns, anomalies, and root causes
   * @param logFilePath Path to the log file to analyze
   * @returns Analysis results including patterns, anomalies, and root causes
   */
  async analyzeLogFile(logFilePath: string): Promise<LogAnalysisResult> {
    if (!this.session) {
      throw new Error("Analyzer not initialized. Call initialize() first.");
    }

    if (!existsSync(logFilePath)) {
      throw new Error(`Log file not found: ${logFilePath}`);
    }

    // Prepare the analysis prompt
    const prompt = `You are an expert log analyzer. Please analyze the attached log file and provide:

1. **Patterns**: Common patterns found in the logs (e.g., recurring error messages, API endpoints being called, user behaviors)
2. **Anomalies**: Unusual or unexpected events, errors, or behaviors that stand out
3. **Root Causes**: Potential root causes for any errors or issues found in the logs

Please structure your response in the following format:
## PATTERNS
- [List patterns here]

## ANOMALIES
- [List anomalies here]

## ROOT CAUSES
- [List root causes here]

## SUMMARY
[Provide a brief summary of the overall health and key findings]`;

    // Send the log file as an attachment and wait for response
    const response = await this.session.sendAndWait({
      prompt,
      attachments: [
        {
          type: "file",
          path: logFilePath,
          displayName: "log-file.log",
        },
      ],
    });

    if (!response || !response.data.content) {
      throw new Error("No response received from Copilot");
    }

    return this.parseAnalysisResponse(response.data.content);
  }

  /**
   * Analyze log content directly (useful for streaming logs or in-memory logs)
   * @param logContent The log content as a string
   * @returns Analysis results
   */
  async analyzeLogContent(logContent: string): Promise<LogAnalysisResult> {
    if (!this.session) {
      throw new Error("Analyzer not initialized. Call initialize() first.");
    }

    const prompt = `You are an expert log analyzer. Please analyze the following log content and provide:

1. **Patterns**: Common patterns found in the logs
2. **Anomalies**: Unusual or unexpected events, errors, or behaviors
3. **Root Causes**: Potential root causes for any errors or issues

Please structure your response in the following format:
## PATTERNS
- [List patterns here]

## ANOMALIES
- [List anomalies here]

## ROOT CAUSES
- [List root causes here]

## SUMMARY
[Provide a brief summary]

Log Content:
\`\`\`
${logContent}
\`\`\``;

    const response = await this.session.sendAndWait({ prompt });

    if (!response || !response.data.content) {
      throw new Error("No response received from Copilot");
    }

    return this.parseAnalysisResponse(response.data.content);
  }

  /**
   * Parse the Copilot response into structured analysis results
   */
  private parseAnalysisResponse(content: string): LogAnalysisResult {
    const result: LogAnalysisResult = {
      patterns: [],
      anomalies: [],
      rootCauses: [],
      summary: "",
    };

    const sections = {
      patterns: /## PATTERNS\s*([\s\S]*?)(?=## |$)/i,
      anomalies: /## ANOMALIES\s*([\s\S]*?)(?=## |$)/i,
      rootCauses: /## ROOT CAUSES\s*([\s\S]*?)(?=## |$)/i,
      summary: /## SUMMARY\s*([\s\S]*?)$/i,
    };

    // Extract patterns
    const patternsMatch = content.match(sections.patterns);
    if (patternsMatch) {
      result.patterns = this.extractListItems(patternsMatch[1]);
    }

    // Extract anomalies
    const anomaliesMatch = content.match(sections.anomalies);
    if (anomaliesMatch) {
      result.anomalies = this.extractListItems(anomaliesMatch[1]);
    }

    // Extract root causes
    const rootCausesMatch = content.match(sections.rootCauses);
    if (rootCausesMatch) {
      result.rootCauses = this.extractListItems(rootCausesMatch[1]);
    }

    // Extract summary
    const summaryMatch = content.match(sections.summary);
    if (summaryMatch) {
      result.summary = summaryMatch[1].trim();
    }

    return result;
  }

  /**
   * Extract list items from markdown list format
   */
  private extractListItems(text: string): string[] {
    const lines = text.split("\n");
    const items: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
        const item = trimmed.substring(1).trim();
        if (item) {
          items.push(item);
        }
      }
    }

    return items;
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.session) {
      await this.session.destroy();
      this.session = null;
    }
    await this.client.stop();
  }
}
