import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";

/**
 * Rate limiter for API endpoints
 * Limits to 30 requests per minute per IP
 */
export const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: {
    success: false,
    error: "Too many requests. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Security headers middleware
 */
export const securityHeaders = (_req: Request, res: Response, next: NextFunction) => {
  // Prevent XSS
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // Content Security Policy
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'"
  );

  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  next();
};

/**
 * Request size limiter (for non-file requests)
 */
export const requestSizeLimiter = (_req: Request, res: Response, next: NextFunction) => {
  // Check content length for non-multipart requests
  const contentLength = parseInt(_req.headers["content-length"] || "0", 10);
  const contentType = _req.headers["content-type"] || "";

  // Skip for multipart (file uploads)
  if (contentType.includes("multipart/form-data")) {
    next();
    return;
  }

  // Limit JSON/text requests to 1MB
  if (contentLength > 1024 * 1024) {
    res.status(413).json({
      success: false,
      error: "Request body too large",
    });
    return;
  }

  next();
};

/**
 * Combined security middleware
 */
export const securityMiddleware = [securityHeaders, rateLimiter, requestSizeLimiter];
