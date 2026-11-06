/**
 * securityLog — structured security/audit telemetry for StockSense.
 *
 * Emits one JSON event per line to backend/logs/security.log (and stdout, so a
 * platform log-drain / SIEM forwarder picks it up too). Field names follow the
 * Elastic Common Schema (ECS) so the stream ingests cleanly into Elastic /
 * Wazuh / Splunk, and security-relevant events carry a MITRE ATT&CK mapping.
 *
 * Design rules:
 *   - Logging must NEVER throw or block a request (best-effort, errors swallowed).
 *   - Secrets/PII beyond what's needed are scrubbed (passwords, tokens, codes).
 *   - The URL path is logged WITHOUT its query string, so one-time tokens that
 *     ride in the query (e.g. /api/auth/verify?token=…) never land in the log.
 */
import { appendFile } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR  = join(__dirname, '../logs');
const LOG_FILE = join(LOG_DIR, 'security.log');

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

// ── Event catalogue ────────────────────────────────────────────────────────
// Maps a short event code → its ECS category/action, default outcome, severity,
// and (where relevant) the MITRE ATT&CK tactic/technique a SOC would pivot on.
const CATALOG = {
  'service.start':        { category: 'process',        action: 'service-start',      outcome: 'success', severity: 'info' },
  'http.access':          { category: 'web',            action: 'http-request',       outcome: 'success', severity: 'info' },
  'http.error':           { category: 'web',            action: 'http-request',       outcome: 'failure', severity: 'medium' },

  'auth.login.success':   { category: 'authentication', action: 'login',              outcome: 'success', severity: 'info',   tactic: 'Initial Access',       tech: ['T1078',     'Valid Accounts'] },
  'auth.login.failure':   { category: 'authentication', action: 'login',              outcome: 'failure', severity: 'low',    tactic: 'Credential Access',    tech: ['T1110',     'Brute Force'] },
  'auth.login.blocked':   { category: 'authentication', action: 'login',              outcome: 'failure', severity: 'medium', tactic: 'Credential Access',    tech: ['T1110',     'Brute Force'] },
  'auth.register':        { category: 'iam',            action: 'user-creation',      outcome: 'success', severity: 'info' },
  'auth.verify.success':  { category: 'iam',            action: 'email-verification', outcome: 'success', severity: 'info' },
  'auth.verify.failure':  { category: 'iam',            action: 'email-verification', outcome: 'failure', severity: 'low' },
  'auth.2fa.issued':      { category: 'authentication', action: 'mfa-challenge',      outcome: 'unknown', severity: 'info' },
  'auth.2fa.success':     { category: 'authentication', action: 'mfa-verify',         outcome: 'success', severity: 'info' },
  'auth.2fa.failure':     { category: 'authentication', action: 'mfa-verify',         outcome: 'failure', severity: 'medium', tactic: 'Credential Access',   tech: ['T1110.001', 'Password Guessing'] },
  'auth.password.change':         { category: 'iam',    action: 'password-change',    outcome: 'success', severity: 'medium', tactic: 'Persistence',        tech: ['T1098',     'Account Manipulation'] },
  'auth.password.change.failure': { category: 'iam',    action: 'password-change',    outcome: 'failure', severity: 'medium', tactic: 'Credential Access',  tech: ['T1110',     'Brute Force'] },
  'iam.mfa.toggle':       { category: 'iam',            action: 'mfa-config-change',  outcome: 'success', severity: 'low' },

  'authz.denied':         { category: 'authorization',  action: 'access-denied',      outcome: 'failure', severity: 'high',   tactic: 'Privilege Escalation', tech: ['T1078',     'Valid Accounts'] },

  'admin.users.list':     { category: 'iam',            action: 'admin-read',         outcome: 'success', severity: 'low' },
  'admin.user.disable':   { category: 'iam',            action: 'account-disable',    outcome: 'success', severity: 'high',   tactic: 'Impact',               tech: ['T1531',     'Account Access Removal'] },
  'admin.user.enable':    { category: 'iam',            action: 'account-enable',     outcome: 'success', severity: 'medium' },
  'admin.user.verify':    { category: 'iam',            action: 'account-verify',     outcome: 'success', severity: 'medium' },
  'admin.user.delete':    { category: 'iam',            action: 'account-delete',     outcome: 'success', severity: 'high',   tactic: 'Impact',               tech: ['T1531',     'Account Access Removal'] },

  'ai.invoke':            { category: 'api',            action: 'ai-inference',       outcome: 'success', severity: 'low' },
  'email.send_all':       { category: 'api',            action: 'bulk-email',         outcome: 'success', severity: 'high',   tactic: 'Impact',               tech: ['T1071',     'Application Layer Protocol'] },
  'email.test':           { category: 'api',            action: 'email-test',         outcome: 'success', severity: 'info' },
  'email.subscribe':      { category: 'api',            action: 'email-subscribe',    outcome: 'success', severity: 'info' },
};

// Keys whose values must never be written, even if a caller passes them.
const SECRET_KEYS = /pass(word)?|hash|token|secret|code|authorization|bearer|cookie|apikey|api_key/i;

function scrub(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    out[k] = SECRET_KEYS.test(k) ? '[REDACTED]'
           : (val && typeof val === 'object' && !Array.isArray(val)) ? scrub(val)
           : val;
  }
  return out;
}

function clientInfo(req) {
  if (!req) return {};
  return {
    ip:        req.ip || req.socket?.remoteAddress || null,   // real client IP (needs trust proxy)
    userAgent: req.headers?.['user-agent'] || null,
    method:    req.method,
    path:      (req.originalUrl || req.url || '').split('?')[0] || req.path, // drop query string
  };
}

function write(doc) {
  const line = JSON.stringify(doc);
  // stdout for platform log drains / `npm start` console
  console.log(line);
  // durable append-only file for the SIEM forwarder to tail
  appendFile(LOG_FILE, line + '\n').catch((e) =>
    console.error('securityLog write failed:', e.message)
  );
}

/**
 * Emit a security event.
 * @param {string} code  one of CATALOG's keys
 * @param {object} opts  { req, user, status, outcome, severity, message, ...details }
 *                       Anything beyond the known keys is treated as event detail
 *                       and nested under `stocksense.*` (scrubbed).
 */
export function logSecurity(code, opts = {}) {
  try {
    const meta = CATALOG[code] || { category: 'event', action: code, outcome: 'unknown', severity: 'info' };
    const { req, user, status, outcome, severity, message, ...details } = opts;
    const ci = clientInfo(req);

    const doc = {
      '@timestamp': new Date().toISOString(),
      event: {
        kind:     'event',
        code,
        category: meta.category,
        action:   meta.action,
        outcome:  outcome  || meta.outcome,
        severity: severity || meta.severity,
      },
      message: message || `${code} (${(outcome || meta.outcome)})`,
      service: { name: 'stocksense', environment: process.env.NODE_ENV || 'development' },
      labels:  { dataset: 'stocksense.security' },
    };

    if (user)         doc.user       = scrub(typeof user === 'object' ? user : { id: user });
    if (ci.ip)        doc.source     = { ip: ci.ip };
    if (ci.userAgent) doc.user_agent = { original: ci.userAgent };
    if (ci.path)      doc.url        = { path: ci.path };
    if (ci.method || status != null) {
      doc.http = {};
      if (ci.method)      doc.http.request  = { method: ci.method };
      if (status != null) doc.http.response = { status_code: status };
    }
    if (meta.tactic || meta.tech) {
      doc.threat = {
        tactic:    meta.tactic ? { name: meta.tactic } : undefined,
        technique: meta.tech   ? { id: meta.tech[0], name: meta.tech[1] } : undefined,
      };
    }
    const extra = scrub(details);
    if (Object.keys(extra).length) doc.stocksense = extra;

    write(doc);
    return doc;
  } catch (e) {
    // Telemetry must never break the request path.
    console.error('securityLog error:', e.message);
  }
}

/**
 * Express middleware — access log for every /api request (one event on finish).
 * This is the baseline traffic source a SOC uses for scanning / enumeration /
 * error-rate detections; the route handlers add the richer security events.
 */
export function accessLog(req, res, next) {
  if (!req.path.startsWith('/api') || req.path === '/api/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    const status = res.statusCode;
    logSecurity(status >= 500 ? 'http.error' : 'http.access', {
      req,
      status,
      severity: status >= 500 ? 'medium' : status >= 400 ? 'low' : 'info',
      duration_ms: Date.now() - start,
    });
  });
  next();
}
