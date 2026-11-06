import express from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/auth.js';
import { updateUser } from '../utils/db.js';
import { checkPassword } from './auth.js';
import { logSecurity } from '../utils/securityLog.js';

const router = express.Router();

// PUT /api/user/password — change password (requires current password)
router.put('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  const match = await bcrypt.compare(currentPassword, req.user.passwordHash);
  if (!match) {
    logSecurity('auth.password.change.failure', { req, user: { id: req.user.id, email: req.user.email }, status: 401, reason: 'bad_current_password' });
    return res.status(401).json({ error: 'Your current password is incorrect.' });
  }

  const checks = checkPassword(newPassword);
  if (!Object.values(checks).every(Boolean)) {
    return res.status(400).json({ error: 'New password does not meet the requirements.', checks });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'New password must be different from the current one.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  updateUser(req.user.id, { passwordHash });
  logSecurity('auth.password.change', { req, user: { id: req.user.id, email: req.user.email }, status: 200 });
  res.json({ ok: true, message: 'Password updated successfully.' });
});

// POST /api/user/2fa — turn two-step verification on/off
router.post('/2fa', requireAuth, (req, res) => {
  const enabled = !!req.body.enabled;
  updateUser(req.user.id, { twoFactorEnabled: enabled });
  logSecurity('iam.mfa.toggle', { req, user: { id: req.user.id, email: req.user.email }, enabled });
  res.json({ ok: true, twoFactorEnabled: enabled });
});

// GET /api/user/watchlist
router.get('/watchlist', requireAuth, (req, res) => {
  res.json(req.user.watchlist || []);
});

// POST /api/user/watchlist
router.post('/watchlist', requireAuth, (req, res) => {
  const { symbol, name } = req.body;
  if (!symbol) return res.status(400).json({ error: 'symbol is required.' });

  const watchlist = req.user.watchlist || [];
  if (watchlist.length >= 30) return res.status(400).json({ error: 'Watchlist is full (30 stocks max).' });
  if (watchlist.find(s => s.symbol === symbol.toUpperCase())) {
    return res.status(400).json({ error: 'Already in watchlist.' });
  }

  const updated = updateUser(req.user.id, {
    watchlist: [...watchlist, {
      symbol: symbol.toUpperCase(),
      name: name || symbol.toUpperCase(),
      addedAt: new Date().toISOString(),
    }],
  });
  res.json(updated.watchlist);
});

// DELETE /api/user/watchlist/:symbol
router.delete('/watchlist/:symbol', requireAuth, (req, res) => {
  const sym = req.params.symbol.toUpperCase();
  const updated = updateUser(req.user.id, {
    watchlist: (req.user.watchlist || []).filter(s => s.symbol !== sym),
  });
  res.json(updated.watchlist);
});

// PUT /api/user/profile
router.put('/profile', requireAuth, (req, res) => {
  const allowed = ['firstName', 'lastName', 'emailNotifications', 'notificationEmail'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  const updated = updateUser(req.user.id, updates);
  const { passwordHash: _, ...safeUser } = updated;
  res.json(safeUser);
});

export default router;
