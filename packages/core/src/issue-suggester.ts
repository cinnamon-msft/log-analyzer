import { CopilotClient, CopilotSession } from "@github/copilot-sdk";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { LogAnalysisResult, IssueSuggestion, GitHubIssue } from "@log-analyzer/shared";

/** Cache for GitHub issue searches to minimize API calls */
const issueCache = new Map<string, { issues: GitHubIssue[]; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Resolves the path to the copilot CLI binary.
 */
function resolveCopilotCliPath(): string {
  try {
    const copilotSdkPath = import.meta.resolve("@github/copilot-sdk");
    const sdkDir = dirname(fileURLToPath(copilotSdkPath));
    const cliPath = join(sdkDir, "..", "..", "copilot", "npm-loader.js");

    if (!existsSync(cliPath)) {
      throw new Error(`Copilot CLI not found at expected path: ${cliPath}`);
    }

    return cliPath;
  } catch (error) {
    throw new Error(
      `Failed to resolve Copilot CLI path: ${error instanceof Error ? error.message : String(error)}. ` +
        "Ensure @github/copilot is installed as a dependency."
    );
  }
}

/**
 * AI-powered issue suggester that generates GitHub search queries
 * and fetches real issues from GitHub API.
 */
export class IssueSuggester {
  private client: CopilotClient;
  private session: CopilotSession | null = null;
  private githubToken?: string;

  constructor(githubToken?: string) {
    this.client = new CopilotClient({
      cliPath: resolveCopilotCliPath(),
    });
    this.githubToken = githubToken || process.env.GITHUB_TOKEN;
  }

  /**
   * Initialize the suggester
   */
  async initialize(): Promise<void> {
    await this.client.start();
    this.session = await this.client.createSession({
      model: "gpt-4o",
    });
  }

  /**
   * Search GitHub for issues matching a query
   */
  private async searchGitHubIssues(
    searchTerms: string,
    repository?: string,
    maxResults: number = 3
  ): Promise<GitHubIssue[]> {
    // Build search query
    let query = `${searchTerms} is:issue`;
    if (repository) {
      query = `repo:${repository} ${query}`;
    }

    // Check cache first
    const cacheKey = query.toLowerCase();
    const cached = issueCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.issues;
    }

    try {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "log-analyzer",
      };

      if (this.githubToken) {
        headers.Authorization = `Bearer ${this.githubToken}`;
      }

      const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=${maxResults}&sort=relevance`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        console.warn(`GitHub API error: ${response.status}`);
        return [];
      }

      const data = await response.json();
      const issues: GitHubIssue[] = ((data as any).items || []).map((item: any) => {
        // Extract repo from URL: https://api.github.com/repos/owner/repo/issues/123
        const repoMatch = item.repository_url?.match(/repos\/([^/]+\/[^/]+)$/);
        const repo = repoMatch ? repoMatch[1] : repository || "unknown";

        return {
          number: item.number,
          title: item.title,
          url: item.html_url,
          state: item.state as "open" | "closed",
          repository: repo,
          comments: item.comments || 0,
          createdAt: item.created_at,
          labels: (item.labels || []).map((l: any) => l.name),
        };
      });

      // Cache the results
      issueCache.set(cacheKey, { issues, timestamp: Date.now() });

      return issues;
    } catch (error) {
      console.warn("Failed to fetch GitHub issues:", error);
      return [];
    }
  }

  /**
   * Generate GitHub issue search suggestions based on log analysis results
   * @param analysisResult The log analysis result
   * @param repositoryHint Optional hint about which repository to search (e.g., "microsoft/vscode")
   * @param fetchRealIssues Whether to fetch actual issues from GitHub API (default: true)
   * @param rawLogContent Optional raw log content for exact text matching
   * @returns Array of issue suggestions with search queries and linked issues
   */
  async suggestIssues(
    analysisResult: LogAnalysisResult,
    repositoryHint?: string,
    fetchRealIssues: boolean = true,
    rawLogContent?: string
  ): Promise<IssueSuggestion[]> {
    if (!this.session) {
      throw new Error("Suggester not initialized. Call initialize() first.");
    }

    // Extract unique error signatures from the analysis
    const errorSignatures = this.extractErrorSignatures(analysisResult);
    
    // Extract exact error lines from raw log content
    const exactErrorLines = rawLogContent 
      ? this.extractExactErrorLines(rawLogContent)
      : [];

    if (errorSignatures.length === 0 && exactErrorLines.length === 0) {
      return [];
    }

    const repoContext = repositoryHint
      ? `The user is interested in issues from the repository: ${repositoryHint}`
      : "Generate generic GitHub search queries that could work across repositories.";

    // Include exact error lines in the prompt for better matching
    const exactLinesSection = exactErrorLines.length > 0
      ? `\n**Exact Error Lines from Log:**\n${exactErrorLines.slice(0, 10).join("\n")}`
      : "";

    const prompt = `You are an expert at finding relevant GitHub issues based on log analysis.

Given the following error signatures and anomalies found in a log file:

**Anomalies:**
${analysisResult.anomalies.join("\n") || "None"}

**Root Causes:**
${analysisResult.rootCauses.join("\n") || "None"}

**Error Signatures:**
${errorSignatures.join("\n")}
${exactLinesSection}

${repoContext}

For each significant error or issue, provide:
1. A concise error signature (use EXACT text from the log when possible - this helps match GitHub issues)
2. GitHub search keywords (use specific error codes, function names, or unique identifiers from the log)
3. A brief description of what the issue likely is
4. Potential solutions based on your knowledge

IMPORTANT: The searchQuery should contain exact text that might appear in GitHub issue titles or descriptions. Use specific error messages, error codes, or unique identifiers from the log.

Format your response as JSON array:
\`\`\`json
[
  {
    "errorSignature": "ECONNREFUSED 127.0.0.1:5432",
    "searchQuery": "ECONNREFUSED 127.0.0.1:5432",
    "description": "Database connection refused, likely PostgreSQL is not running",
    "potentialSolutions": ["Start PostgreSQL service", "Check if port 5432 is blocked", "Verify database host configuration"]
  }
]
\`\`\`

Provide suggestions for the top 3-5 most significant issues only.`;

    const response = await this.session.sendAndWait({ prompt });

    if (!response || !response.data.content) {
      return [];
    }

    const suggestions = this.parseIssueSuggestions(response.data.content);

    // Fetch real GitHub issues for each suggestion
    // Try multiple search strategies for better results
    if (fetchRealIssues && suggestions.length > 0) {
      for (const suggestion of suggestions) {
        // Strategy 1: Search with the exact error signature
        let issues = await this.searchGitHubIssues(
          suggestion.errorSignature,
          repositoryHint,
          5
        );

        // Strategy 2: If no results, try the search query
        if (issues.length === 0 && suggestion.searchQuery !== suggestion.errorSignature) {
          issues = await this.searchGitHubIssues(
            suggestion.searchQuery,
            repositoryHint,
            5
          );
        }

        // Strategy 3: Try exact error lines that match
        if (issues.length === 0 && exactErrorLines.length > 0) {
          // Find an error line that matches this suggestion
          for (const line of exactErrorLines) {
            const lineWords = line.toLowerCase().split(/\s+/);
            const sigWords = suggestion.errorSignature.toLowerCase().split(/\s+/);
            const overlap = lineWords.filter(w => sigWords.includes(w)).length;
            
            if (overlap >= 2) {
              // Use key parts of this error line
              const searchTerms = this.extractSearchTermsFromLine(line);
              if (searchTerms) {
                issues = await this.searchGitHubIssues(searchTerms, repositoryHint, 5);
                if (issues.length > 0) break;
              }
            }
          }
        }

        suggestion.linkedIssues = issues;
      }
    }

    return suggestions;
  }

  /**
   * Extract exact error lines from raw log content
   */
  private extractExactErrorLines(content: string): string[] {
    const lines = content.split('\n');
    const errorLines: string[] = [];
    
    const errorPatterns = [
      /\berror\b/i,
      /\bexception\b/i,
      /\bfailed\b/i,
      /\bfailure\b/i,
      /\bcrash(ed)?\b/i,
      /\bfatal\b/i,
      /\bE[A-Z]{4,}/,  // Error codes like ECONNREFUSED, ETIMEDOUT
      /\bHTTP\s*[45]\d{2}\b/i,
      /\bstatus\s*code\s*[45]\d{2}\b/i,
      /\bpanic\b/i,
      /\bsegfault\b/i,
      /\bcannot\b/i,
      /\bunable to\b/i,
    ];

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty or very short lines
      if (trimmed.length < 10 || trimmed.length > 200) continue;
      
      // Check if line matches any error pattern
      for (const pattern of errorPatterns) {
        if (pattern.test(trimmed)) {
          // Clean up the line - remove timestamps at start
          let cleaned = trimmed
            .replace(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.,]?\d*Z?\s*/i, '')
            .replace(/^\[\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.,]?\d*Z?\]\s*/i, '')
            .replace(/^\d{2}:\d{2}:\d{2}[.,]?\d*\s*/i, '')
            .trim();
          
          if (cleaned.length >= 10) {
            errorLines.push(cleaned);
          }
          break;
        }
      }
    }

    // Deduplicate and limit
    return [...new Set(errorLines)].slice(0, 20);
  }

  /**
   * Extract the most useful search terms from an error line
   */
  private extractSearchTermsFromLine(line: string): string | null {
    // Remove common prefixes like log levels
    let cleaned = line
      .replace(/^\[(ERROR|WARN|INFO|DEBUG)\]\s*/i, '')
      .replace(/^(ERROR|WARN|INFO|DEBUG)[:\s]+/i, '')
      .trim();

    // Extract error codes (e.g., ECONNREFUSED, ETIMEDOUT)
    const errorCodeMatch = cleaned.match(/\b(E[A-Z]{4,})\b/);
    if (errorCodeMatch) {
      // Get the error code and some context
      const idx = cleaned.indexOf(errorCodeMatch[1]);
      const snippet = cleaned.slice(idx, idx + 50).split(/\s+/).slice(0, 4).join(' ');
      return snippet;
    }

    // Extract HTTP errors
    const httpMatch = cleaned.match(/HTTP\s*([45]\d{2})/i);
    if (httpMatch) {
      return `HTTP ${httpMatch[1]} ${cleaned.slice(0, 30)}`.trim();
    }

    // Extract exception types (e.g., NullPointerException, TypeError)
    const exceptionMatch = cleaned.match(/\b(\w+(?:Exception|Error|Failure))\b/);
    if (exceptionMatch) {
      const idx = cleaned.indexOf(exceptionMatch[1]);
      const snippet = cleaned.slice(Math.max(0, idx - 10), idx + exceptionMatch[1].length + 30).trim();
      return snippet.slice(0, 60);
    }

    // Just return first 50 chars of meaningful content
    const words = cleaned.split(/\s+/).filter(w => w.length > 2);
    if (words.length >= 3) {
      return words.slice(0, 5).join(' ');
    }

    return null;
  }

  /**
   * Extract error signatures from analysis results
   */
  private extractErrorSignatures(result: LogAnalysisResult): string[] {
    const signatures: string[] = [];

    // Common error patterns to look for
    const errorPatterns = [
      /Error:\s*(.+)/gi,
      /Exception:\s*(.+)/gi,
      /ECONNREFUSED\s*\S+/gi,
      /ETIMEDOUT\s*\S+/gi,
      /ENOTFOUND\s*\S+/gi,
      /ENOMEM/gi,
      /OOM/gi,
      /timeout/gi,
      /failed to\s+(.+)/gi,
      /cannot\s+(.+)/gi,
      /unable to\s+(.+)/gi,
      /\b[A-Z][A-Z0-9_]+Error\b/g,
      /HTTP\s*(4\d{2}|5\d{2})/gi,
      /status\s*code\s*(4\d{2}|5\d{2})/gi,
    ];

    // Extract from anomalies
    for (const anomaly of result.anomalies) {
      for (const pattern of errorPatterns) {
        const matches = anomaly.match(pattern);
        if (matches) {
          signatures.push(...matches);
        }
      }
      // Also add the full anomaly as a potential signature
      if (anomaly.length < 100) {
        signatures.push(anomaly);
      }
    }

    // Extract from root causes
    for (const cause of result.rootCauses) {
      if (cause.length < 100) {
        signatures.push(cause);
      }
    }

    // Also extract from patterns - they often contain error-related info
    for (const pattern of result.patterns) {
      for (const errorPattern of errorPatterns) {
        const matches = pattern.match(errorPattern);
        if (matches) {
          signatures.push(...matches);
        }
      }
      // Add short patterns as signatures
      if (pattern.length < 100 && pattern.toLowerCase().includes('error')) {
        signatures.push(pattern);
      }
    }

    // If still empty, try to extract from summary
    if (signatures.length === 0 && result.summary) {
      for (const pattern of errorPatterns) {
        const matches = result.summary.match(pattern);
        if (matches) {
          signatures.push(...matches);
        }
      }
    }

    // Deduplicate and limit
    const unique = [...new Set(signatures)];
    return unique.slice(0, 10);
  }

  /**
   * Parse issue suggestions from Copilot response
   */
  private parseIssueSuggestions(content: string): IssueSuggestion[] {
    try {
      // Extract JSON from the response
      const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => ({
            errorSignature: String(item.errorSignature || ""),
            searchQuery: String(item.searchQuery || ""),
            description: String(item.description || ""),
            potentialSolutions: Array.isArray(item.potentialSolutions)
              ? item.potentialSolutions.map(String)
              : [],
          }));
        }
      }

      // Try to parse the whole content as JSON
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => ({
          errorSignature: String(item.errorSignature || ""),
          searchQuery: String(item.searchQuery || ""),
          description: String(item.description || ""),
          potentialSolutions: Array.isArray(item.potentialSolutions)
            ? item.potentialSolutions.map(String)
            : [],
        }));
      }
    } catch {
      // If parsing fails, return empty array
      console.warn("Failed to parse issue suggestions from Copilot response");
    }

    return [];
  }

  /**
   * Generate a single search query for a specific error
   * @param errorMessage The error message to search for
   * @param repository Optional repository in owner/repo format
   * @returns A GitHub search URL
   */
  generateSearchUrl(errorMessage: string, repository?: string): string {
    // Clean and truncate the error message for search
    let searchTerms = errorMessage
      .replace(/[^\w\s\-:]/g, " ") // Remove special characters except hyphen and colon
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim()
      .substring(0, 100); // Limit length

    let query = `${searchTerms} is:issue`;

    if (repository) {
      query = `repo:${repository} ${query}`;
    }

    return `https://github.com/search?q=${encodeURIComponent(query)}&type=issues`;
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
