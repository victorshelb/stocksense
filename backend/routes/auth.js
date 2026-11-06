import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { findUserByEmail, findUserById, createUser, updateUser, getAllUsers } from '../utils/db.js';
import { JWT_SECRET, requireAuth } from '../middleware/auth.js';
import { sendVerificationEmail, sendLoginCode } from '../utils/email.js';
import { logSecurity } from '../utils/securityLog.js';

const router = express.Router();

const APP_URL = () => process.env.APP_URL || 'http://localhost:3003';
const isAdminEmail = (email) =>
  !!process.env.ADMIN_EMAIL && email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase();

// Strip secrets and compute admin status dynamically (so an existing account
// becomes admin the moment ADMIN_EMAIL is set to its address).
const toSafeUser = (user) => {
  const { passwordHash, verifyToken, twoFactorCode, twoFactorCodeExpires, ...rest } = user;
  return { ...rest, isAdmin: !!(user.isAdmin || isAdminEmail(user.email)) };
};

// ── Password validation ──────────────────────────────────────────────────
export function checkPassword(password) {
  return {
    length:    password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number:    /[0-9]/.test(password),
    special:   /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(password),
  };
}

// POST /api/auth/register — creates an UNVERIFIED account + sends a verify email
router.post('/register', async (req, res) => {
  const { firstName, lastName, email, password } = req.body;

  if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const checks = checkPassword(password);
  if (!Object.values(checks).every(Boolean)) {
    return res.status(400).json({ error: 'Password does not meet requirements.', checks });
  }

  const cleanEmail = email.toLowerCase().trim();
  if (findUserByEmail(cleanEmail)) {
    // Repeated hits here from one source can indicate account enumeration.
    logSecurity('auth.register', { req, user: { email: cleanEmail }, status: 400, outcome: 'failure', reason: 'email_exists' });
    return res.status(400).json({ error: 'An account with this email already exists.' });
  }

  const passwordHash  = await bcrypt.hash(password, 12);
  const verifyToken   = uuidv4();
  const user = createUser({
    id: uuidv4(),
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: cleanEmail,
    passwordHash,
    verified: false,
    verifyToken,
    isAdmin: isAdminEmail(cleanEmail),
    disabled: false,
    watchlist: [],
    emailNotifications: false,
    notificationEmail: cleanEmail,
    createdAt: new Date().toISOString(),
  });

  const relativeLink = `/api/auth/verify?token=${verifyToken}`;
  const absoluteLink = `${APP_URL()}${relativeLink}`;

  // Try to email the (absolute) link. If email isn't configured yet (testing
  // stage), return an origin-relative link so the flow still works same-server.
  let emailed = false;
  try {
    await sendVerificationEmail(user, absoluteLink);
    emailed = true;
  } catch (err) {
    console.warn('Verification email not sent:', err.message);
  }

  logSecurity('auth.register', { req, user: { id: user.id, email: cleanEmail }, status: 201, emailed });

  res.status(201).json({
    ok: true,
    emailed,
    message: emailed
      ? `Almost there! We sent a verification link to ${cleanEmail}. Click it to activate your account.`
      : 'Account created. Email sending isn\'t configured yet — use the button below to verify (testing mode).',
    verifyLink: emailed ? undefined : relativeLink,
  });
});

// GET /api/auth/verify?token=... — activates the account, then bounces to login
router.get('/verify', (req, res) => {
  const { token } = req.query;
  const found = token ? getAllUsers().find(u => u.verifyToken && u.verifyToken === token) : null;
  if (!found) {
    logSecurity('auth.verify.failure', { req, reason: 'invalid_token' });
    return res.redirect('/login?verify=invalid');   // origin-relative → same server
  }
  updateUser(found.id, { verified: true, verifyToken: null });
  logSecurity('auth.verify.success', { req, user: { id: found.id, email: found.email } });
  res.redirect('/login?verify=success');
});

// POST /api/auth/login — only verified, non-disabled accounts may sign in
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = findUserByEmail(email);
  if (!user) {
    logSecurity('auth.login.failure', { req, user: { email: email.toLowerCase().trim() }, status: 401, reason: 'user_not_found' });
    return res.status(401).json({ error: 'No account found with this email address.' });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    logSecurity('auth.login.failure', { req, user: { id: user.id, email: user.email }, status: 401, reason: 'bad_password' });
    return res.status(401).json({ error: 'Incorrect password. Please try again.' });
  }

  if (user.disabled) {
    logSecurity('auth.login.blocked', { req, user: { id: user.id, email: user.email }, status: 403, reason: 'account_disabled' });
    return res.status(403).json({ error: 'This account has been disabled. Contact support.' });
  }
  // Only block accounts that are EXPLICITLY unverified (new signups). Legacy
  // accounts created before email verification have `verified === undefined`.
  if (user.verified === false) {
    logSecurity('auth.login.blocked', { req, user: { id: user.id, email: user.email }, status: 403, reason: 'account_unverified' });
    return res.status(403).json({ error: 'Please verify your email before signing in. Check your inbox for the link.', unverified: true });
  }

  // ── Two-step verification ──
  if (user.twoFactorEnabled) {
    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
    updateUser(user.id, { twoFactorCode: code, twoFactorCodeExpires: Date.now() + 10 * 60 * 1000 });
    let emailed = false;
    try { await sendLoginCode(user, code); emailed = true; }
    catch (e) { console.warn('2FA code email not sent:', e.message); }
    logSecurity('auth.2fa.issued', { req, user: { id: user.id, email: user.email }, emailed });
    return res.json({
      twoFactorRequired: true,
      userId: user.id,
      emailed,
      // testing fallback when email isn't configured
      devCode: emailed ? undefined : code,
    });
  }

  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
  logSecurity('auth.login.success', { req, user: { id: user.id, email: user.email }, status: 200, mfa: false });
  res.json({ token, user: toSafeUser(user) });
});

// POST /api/auth/2fa/verify — exchange a correct 6-digit code for a token
router.post('/2fa/verify', (req, res) => {
  const { userId, code } = req.body;
  const user = userId ? findUserById(userId) : null;
  if (!user || !user.twoFactorCode) {
    logSecurity('auth.2fa.failure', { req, user: { id: userId }, status: 400, reason: 'no_pending' });
    return res.status(400).json({ error: 'No pending verification. Sign in again.' });
  }
  if (Date.now() > (user.twoFactorCodeExpires || 0)) {
    logSecurity('auth.2fa.failure', { req, user: { id: user.id, email: user.email }, status: 400, reason: 'expired' });
    return res.status(400).json({ error: 'That code expired. Sign in again to get a new one.' });
  }
  if (String(code).trim() !== user.twoFactorCode) {
    logSecurity('auth.2fa.failure', { req, user: { id: user.id, email: user.email }, status: 401, reason: 'bad_code' });
    return res.status(401).json({ error: 'Incorrect code. Please try again.' });
  }
  updateUser(user.id, { twoFactorCode: null, twoFactorCodeExpires: null });
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
  logSecurity('auth.2fa.success', { req, user: { id: user.id, email: user.email } });
  logSecurity('auth.login.success', { req, user: { id: user.id, email: user.email }, status: 200, mfa: true });
  res.json({ token, user: toSafeUser(user) });
});

// GET /api/auth/me — verify token + return user
router.get('/me', requireAuth, (req, res) => {
  res.json(toSafeUser(req.user));
});

export default router;
