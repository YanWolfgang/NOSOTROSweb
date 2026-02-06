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
    const bs = req.user.businesses || [];
    if (req.user.role === 'admin' || bs.includes(business)) return next();
    res.status(403).json({ error: `Sin acceso a ${business}` });
  };
}

module.exports = { verifyToken, requireAdmin, requireBusiness, SECRET };
