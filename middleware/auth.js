const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'panelcentral-secret-2026';

function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Token requerido' });
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo admin' });
  next();
}

function requireBusiness(business) {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    // Check unified permissions first, fallback to legacy businesses array
    const perms = req.user.permissions || {};
    if (perms[business] && perms[business].length > 0) return next();
    const bs = req.user.businesses || [];
    if (bs.includes(business)) return next();
    res.status(403).json({ error: `Sin acceso a ${business}` });
  };
}

function requirePermission(business, action) {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    const perms = req.user.permissions || {};
    const modulePerms = perms[business] || [];
    if (modulePerms.includes(action)) return next();
    res.status(403).json({ error: `Sin permiso: ${action} en ${business}` });
  };
}

module.exports = { verifyToken, requireAdmin, requireBusiness, requirePermission, SECRET };
