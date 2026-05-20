const jwt = require("jsonwebtoken");
const { query } = require("./db");

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await query("SELECT id, name, email, created_at FROM users WHERE id = $1", [payload.sub]);
    if (!rows[0]) {
      return res.status(401).json({ message: "Invalid session" });
    }
    req.user = rows[0];
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

async function requireProjectRole(req, res, next) {
  const projectId = req.params.projectId || req.params.id;
  const { rows } = await query(
    `SELECT p.id AS project_id, pm.role
     FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     WHERE p.id = $1 AND pm.user_id = $2`,
    [projectId, req.user.id]
  );

  if (!rows[0]) {
    return res.status(404).json({ message: "Project not found" });
  }

  req.projectRole = rows[0].role;
  return next();
}

function requireAdmin(req, res, next) {
  if (req.projectRole !== "Admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  return next();
}

module.exports = { signToken, requireAuth, requireProjectRole, requireAdmin };
