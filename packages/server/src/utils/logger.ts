/**
 * Utility functions for secure logging
 */

/**
 * Safely log an error with sanitized information in production
 * @param context Context or label for the error (e.g., "Analysis error", "Server error")
 * @param error The error to log
 */
export function logError(context: string, error: unknown): void {
  if (process.env.NODE_ENV === "production") {
    // In production, only log error message and type, not full stack trace
    console.error(`${context}:`, {
      message: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : "Error",
      timestamp: new Date().toISOString()
    });
  } else {
    // In development, log full error for debugging
    console.error(`${context}:`, error);
  }
}
