function isAdmin(req) {
  return Boolean(req && req.user && req.user.role_id === 1);
}

function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  if (res && typeof res.status === "function") res.status(403);
  if (res && typeof res.send === "function") {
    res.send("Forbidden: DB Code is available to administrators only.");
  }
  return false;
}

module.exports = { isAdmin, requireAdmin };
