import crypto from "crypto";

/**
 * Request Correlation ID Middleware
 * 
 * Assigns a unique ID to every incoming request for distributed tracing.
 * Supports incoming X-Request-ID header (trusted from CDN/proxy) but
 * always generates a fresh one if not provided.
 * 
 * The ID is attached to req.id and included in response headers.
 */

const generateRequestId = () => crypto.randomUUID();

export const requestIdMiddleware = (req, res, next) => {
  // Use incoming request ID if present (from CDN/proxy), otherwise generate
  const incomingId = req.headers["x-request-id"];
  const requestId = (incomingId && typeof incomingId === "string" && incomingId.length < 128)
    ? incomingId
    : generateRequestId();

  req.id = requestId;

  // Include in response headers for client-side debugging
  res.setHeader("X-Request-ID", requestId);

  next();
};

export default requestIdMiddleware;
