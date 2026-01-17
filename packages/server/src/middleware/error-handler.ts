import { Request, Response, NextFunction } from "express";

/**
 * Global error handler middleware
 */
export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error("Server error:", err);

  // Handle multer errors
  if (err.name === "MulterError") {
    const multerError = err as any;
    if (multerError.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        success: false,
        error: "File too large",
      });
      return;
    }
    if (multerError.code === "LIMIT_FILE_COUNT") {
      res.status(400).json({
        success: false,
        error: "Too many files. Maximum is 10 files per request.",
      });
      return;
    }
    if (multerError.code === "LIMIT_UNEXPECTED_FILE") {
      res.status(400).json({
        success: false,
        error: "Unexpected file field",
      });
      return;
    }
  }

  // Handle validation errors
  if (err.message.includes("Invalid file type") || err.message.includes("Invalid filename")) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // Generic error response
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
};
