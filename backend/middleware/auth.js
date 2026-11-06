import jwt from 'jsonwebtoken';
import { findUserById } from '../utils/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'stocksense-dev-secret-change-in-production';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }
  try {
    const token  = header.slice(7);
    const { id } = jwt.verify(token, JWT_SECRET);
    const user   = findUserById(id);
    if (!user) return res.status(401).json({ error: 'Account not found.' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

/**
 * Attaches req.user when a valid token is present, but never rejects.
 * Used on otherwise-public endpoints (the AI routes) purely so telemetry can
 * tell an authenticated caller apart from an anonymous one.
 */
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const { id } = jwt.verify(header.slice(7), JWT_SECRET);
      const user = findUserById(id);
      if (user) req.user = user;
    } catch { /* ignore — treat as anonymous */ }
  }
  next();
}

export { JWT_SECRET };
