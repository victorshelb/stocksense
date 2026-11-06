import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { updateUser, getAllSubscribed } from '../utils/db.js';
import { sendDigestToUser } from '../utils/email.js';
import { logSecurity } from '../utils/securityLog.js';

const router = express.Router();

// POST /api/email/subscribe — toggle email notifications
// When turning alerts ON, we send the first digest right away so the user
// immediately sees the connection working (not just a saved preference).
router.post('/subscribe', requireAuth, async (req, res) => {
  const { enabled, notificationEmail } = req.body;
  const updates = { emailNotifications: !!enabled };
  if (notificationEmail) updates.notificationEmail = notificationEmail.toLowerCase().trim();

  const updated = updateUser(req.user.id, updates);

  let welcomeSent = false, emailError = null;
  if (enabled && updated?.watchlist?.length) {
    try { await sendDigestToUser(updated); welcomeSent = true; }
    catch (e) { emailError = e.message; console.warn('Welcome digest not sent:', e.message); }
  }
  res.json({ ok: true, emailNotifications: !!enabled, welcomeSent, emailError });
});

// POST /api/email/test — send a test digest to the current user
router.post('/test', requireAuth, async (req, res) => {
  const user = { ...req.user, ...(req.body.notificationEmail ? { notificationEmail: req.body.notificationEmail } : {}) };

  if (!user.watchlist?.length) {
    return res.status(400).json({ error: 'Add some stocks to your watchlist first.' });
  }

  try {
    await sendDigestToUser(user);
    res.json({ ok: true, message: `Digest sent to ${user.notificationEmail || user.email}` });
  } catch (err) {
    console.error('Email send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/email/send-all — trigger digest for all subscribed users (server-side cron or admin)
router.post('/send-all', async (req, res) => {
  const { secret } = req.body;
  if (!secret || secret !== process.env.EMAIL_TRIGGER_SECRET) {
    // Probing a privileged bulk-email trigger — treat as an access-denied signal.
    logSecurity('authz.denied', { req, status: 401, resource: '/api/email/send-all', reason: 'bad_trigger_secret' });
    return res.status(401).json({ error: 'Unauthorised.' });
  }

  const subscribed = getAllSubscribed();
  let sent = 0, failed = 0;

  for (const user of subscribed) {
    try { await sendDigestToUser(user); sent++; }
    catch { failed++; }
  }

  logSecurity('email.send_all', { req, recipients: subscribed.length, sent, failed });
  res.json({ sent, failed, total: subscribed.length });
});

export default router;
