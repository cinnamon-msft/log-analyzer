/**
 * HTML entity map for sanitization
 */
const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
  "`": "&#x60;",
  "=": "&#x3D;",
};

/**
 * Sanitize a string to prevent XSS attacks by escaping HTML entities
 * @param input The string to sanitize
 * @returns The sanitized string safe for HTML display
 */
export function sanitizeHtml(input: string): string {
  return input.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Sanitize log content for display
 * Removes potentially dangerous content while preserving readability
 * @param logContent Raw log content
 * @returns Sanitized log content
 */
export function sanitizeLogContent(logContent: string): string {
  // First escape HTML entities
  let sanitized = sanitizeHtml(logContent);

  // Remove any null bytes
  sanitized = sanitized.replace(/\0/g, "");

  // Limit line length to prevent UI issues
  const lines = sanitized.split("\n");
  const processedLines = lines.map((line) => {
    if (line.length > 10000) {
      return line.substring(0, 10000) + "... [truncated]";
    }
    return line;
  });

  return processedLines.join("\n");
}

/**
 * Validate that a filename is safe (no path traversal)
 * @param filename The filename to validate
 * @returns true if the filename is safe
 */
export function isValidFilename(filename: string): boolean {
  // Reject empty filenames
  if (!filename || filename.trim() === "") {
    return false;
  }

  // Reject path traversal attempts
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return false;
  }

  // Reject hidden files
  if (filename.startsWith(".")) {
    return false;
  }

  // Only allow safe extensions
  const allowedExtensions = [".log", ".txt", ".json"];
  const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));
  return allowedExtensions.includes(ext);
}

/**
 * Truncate content to a maximum length with ellipsis
 * @param content The content to truncate
 * @param maxLength Maximum length
 * @returns Truncated content
 */
export function truncate(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.substring(0, maxLength - 3) + "...";
}
