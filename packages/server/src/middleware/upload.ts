import multer from "multer";
import { Request } from "express";
import { isValidFilename } from "@log-analyzer/shared";

/**
 * Allowed file extensions for log files
 */
const ALLOWED_EXTENSIONS = [".log", ".txt", ".json"];

/**
 * Maximum file count per request
 */
const MAX_FILE_COUNT = 10;

/**
 * File filter to validate uploads
 */
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) => {
  // Check extension
  const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf("."));

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    callback(new Error(`Invalid file type. Allowed types: ${ALLOWED_EXTENSIONS.join(", ")}`));
    return;
  }

  // Check for path traversal attempts
  if (file.originalname.includes("..") || file.originalname.includes("/") || file.originalname.includes("\\")) {
    callback(new Error("Invalid filename"));
    return;
  }

  callback(null, true);
};

/**
 * Multer configuration using memory storage
 * Files are stored in memory as buffers for security
 * No files are written to disk
 */
const storage = multer.memoryStorage();

/**
 * Upload middleware with memory storage and validation
 * No file size limit, but uses memory so very large files may cause issues
 */
export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    files: MAX_FILE_COUNT,
    // No fileSize limit as per requirements
  },
});

/**
 * Cleanup utility for any temporary files (not needed with memory storage)
 * Kept for API consistency in case we switch to disk storage later
 */
export const cleanupFiles = async (files: Express.Multer.File[] | undefined): Promise<void> => {
  // With memory storage, no cleanup needed
  // Files are automatically garbage collected when request ends
};
