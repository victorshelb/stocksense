import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getAllUsers, updateUser, deleteUser, findUserById } from '../utils/db.js';
import { logSecurity } from '../utils/securityLog.js';

const router = express.Router();

// Admin = the account whose email matches ADMIN_EMAIL, or one flagged isAdmin.
function requireAdmin(req, res, next) {
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const isAdmin = req.user?.isAdmin || (adminEmail && req.user?.email?.toLowerCase() === adminEmail);
  if (!isAdmin) {
    // A non-admin reaching an admin route is a privilege-escalation signal.
    logSecurity('authz.denied', { req, user: { id: req.user?.id, email: req.user?.email }, status: 403, resource: req.originalUrl?.split('?')[0] });
    return res.status(403).json({ error: 'Admin access only.' });
  }
  next();
}

// Strip every sensitive field (incl. pending 2FA codes / tokens) from admin output.
const safe = ({ passwordHash, verifyToken, twoFactorCode, twoFactorCodeExpires, ...u }) => u;

// GET /api/admin/users — list every signed-up user
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const users = getAllUsers()
    .map(safe)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  logSecurity('admin.users.list', { req, user: { id: req.user.id, email: req.user.email }, count: users.length });
  res.json({
    count: users.length,
    verified: users.filter(u => u.verified).length,
    users,
  });
});

// POST /api/admin/users/:id/toggle — enable/disable an account
router.post('/users/:id/toggle', requireAuth, requireAdmin, (req, res) => {
  const target = findUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.id === req.user.id) return res.status(400).json({ error: "You can't disable your own admin account." });
  const updated = updateUser(req.params.id, { disabled: !target.disabled });
  logSecurity(updated.disabled ? 'admin.user.disable' : 'admin.user.enable', {
    req,
    user: { id: req.user.id, email: req.user.email },
    target: { id: target.id, email: target.email },
  });
  res.json(safe(updated));
});

// POST /api/admin/users/:id/verify — manually mark an account verified (admin override)
router.post('/users/:id/verify', requireAuth, requireAdmin, (req, res) => {
  const updated = updateUser(req.params.id, { verified: true, verifyToken: null });
  if (!updated) return res.status(404).json({ error: 'User not found.' });
  logSecurity('admin.user.verify', { req, user: { id: req.user.id, email: req.user.email }, target: { id: updated.id, email: updated.email } });
  res.json(safe(updated));
});

// DELETE /api/admin/users/:id — remove an account
router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "You can't delete your own admin account." });
  const target = findUserById(req.params.id);
  const ok = deleteUser(req.params.id);
  if (!ok) return res.status(404).json({ error: 'User not found.' });
  logSecurity('admin.user.delete', { req, user: { id: req.user.id, email: req.user.email }, target: { id: req.params.id, email: target?.email } });
  res.json({ ok: true });
});

export default router;
