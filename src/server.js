require("dotenv").config();

const path = require("path");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const { migrate, query, transaction } = require("./db");
const { signToken, requireAuth, requireProjectRole, requireAdmin } = require("./auth");
const {
  signupSchema,
  loginSchema,
  projectSchema,
  memberSchema,
  taskSchema,
  taskUpdateSchema,
  validate
} = require("./validation");

const app = express();
const port = process.env.PORT || 3000;

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) {
  throw new Error("JWT_SECRET is required and should be at least 24 characters.");
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

function userPayload(user) {
  return { id: user.id, name: user.name, email: user.email };
}

async function getProjectMembers(projectId) {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, pm.role, pm.joined_at
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1
     ORDER BY pm.role, u.name`,
    [projectId]
  );
  return rows;
}

async function assertAssigneeBelongsToProject(projectId, assigneeId) {
  if (!assigneeId) return;
  const { rows } = await query(
    "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, assigneeId]
  );
  if (!rows[0]) {
    const error = new Error("Assignee must be a member of this project");
    error.status = 400;
    throw error;
  }
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/signup", validate(signupSchema), async (req, res, next) => {
  try {
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [req.body.name, req.body.email, passwordHash]
    );
    res.status(201).json({ token: signToken(rows[0]), user: userPayload(rows[0]) });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Email is already registered" });
    }
    return next(error);
  }
});

app.post("/api/auth/login", validate(loginSchema), async (req, res, next) => {
  try {
    const { rows } = await query("SELECT * FROM users WHERE email = $1", [req.body.email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    res.json({ token: signToken(user), user: userPayload(user) });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: userPayload(req.user) });
});

app.get("/api/projects", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.id, p.name, p.description, p.created_at, pm.role,
        COUNT(t.id)::int AS task_count,
        COUNT(t.id) FILTER (WHERE t.status = 'Done')::int AS done_count
       FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
       LEFT JOIN tasks t ON t.project_id = p.id
       WHERE pm.user_id = $1
       GROUP BY p.id, pm.role
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json({ projects: rows });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/projects", requireAuth, validate(projectSchema), async (req, res, next) => {
  try {
    const project = await transaction(async (client) => {
      const created = await client.query(
        `INSERT INTO projects (name, description, owner_id)
         VALUES ($1, $2, $3)
         RETURNING id, name, description, created_at`,
        [req.body.name, req.body.description, req.user.id]
      );
      await client.query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'Admin')",
        [created.rows[0].id, req.user.id]
      );
      return created.rows[0];
    });
    res.status(201).json({ project: { ...project, role: "Admin" } });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/projects/:id", requireAuth, requireProjectRole, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.id, p.name, p.description, p.created_at, p.updated_at, pm.role
       FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
       WHERE p.id = $1 AND pm.user_id = $2`,
      [req.params.id, req.user.id]
    );
    const tasks = await query(
      `SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date,
        t.assignee_id, assignee.name AS assignee_name, assignee.email AS assignee_email,
        creator.name AS creator_name, t.created_at, t.updated_at
       FROM tasks t
       LEFT JOIN users assignee ON assignee.id = t.assignee_id
       JOIN users creator ON creator.id = t.created_by
       WHERE t.project_id = $1
       ORDER BY COALESCE(t.due_date, '9999-12-31'::date), t.created_at DESC`,
      [req.params.id]
    );
    res.json({ project: rows[0], members: await getProjectMembers(req.params.id), tasks: tasks.rows });
  } catch (error) {
    return next(error);
  }
});

app.post(
  "/api/projects/:projectId/members",
  requireAuth,
  requireProjectRole,
  requireAdmin,
  validate(memberSchema),
  async (req, res, next) => {
    try {
      const user = await query("SELECT id FROM users WHERE email = $1", [req.body.email]);
      if (!user.rows[0]) {
        return res.status(404).json({ message: "No registered user found with that email" });
      }
      if (user.rows[0].id === req.user.id && req.body.role !== "Admin") {
        return res.status(400).json({ message: "You cannot remove your own Admin role" });
      }

      await query(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [req.params.projectId, user.rows[0].id, req.body.role]
      );
      res.status(201).json({ members: await getProjectMembers(req.params.projectId) });
    } catch (error) {
      return next(error);
    }
  }
);

app.delete(
  "/api/projects/:projectId/members/:userId",
  requireAuth,
  requireProjectRole,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (req.params.userId === req.user.id) {
        return res.status(400).json({ message: "Admins cannot remove themselves" });
      }
      await query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [
        req.params.projectId,
        req.params.userId
      ]);
      res.json({ members: await getProjectMembers(req.params.projectId) });
    } catch (error) {
      return next(error);
    }
  }
);

app.post(
  "/api/projects/:projectId/tasks",
  requireAuth,
  requireProjectRole,
  requireAdmin,
  validate(taskSchema),
  async (req, res, next) => {
    try {
      await assertAssigneeBelongsToProject(req.params.projectId, req.body.assigneeId);
      const { rows } = await query(
        `INSERT INTO tasks (project_id, title, description, status, priority, due_date, assignee_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          req.params.projectId,
          req.body.title,
          req.body.description,
          req.body.status,
          req.body.priority,
          req.body.dueDate || null,
          req.body.assigneeId || null,
          req.user.id
        ]
      );
      res.status(201).json({ task: rows[0] });
    } catch (error) {
      return next(error);
    }
  }
);

app.patch(
  "/api/projects/:projectId/tasks/:taskId",
  requireAuth,
  requireProjectRole,
  validate(taskUpdateSchema),
  async (req, res, next) => {
    try {
      const existing = await query("SELECT * FROM tasks WHERE id = $1 AND project_id = $2", [
        req.params.taskId,
        req.params.projectId
      ]);
      const task = existing.rows[0];
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      const memberCanOnlyUpdateOwnStatus =
        req.projectRole === "Member" &&
        (task.assignee_id !== req.user.id || Object.keys(req.body).some((key) => key !== "status"));

      if (memberCanOnlyUpdateOwnStatus) {
        return res.status(403).json({ message: "Members can only update status for tasks assigned to them" });
      }

      if (req.body.assigneeId) {
        await assertAssigneeBelongsToProject(req.params.projectId, req.body.assigneeId);
      }

      const nextTask = {
        title: req.body.title ?? task.title,
        description: req.body.description ?? task.description,
        status: req.body.status ?? task.status,
        priority: req.body.priority ?? task.priority,
        dueDate: req.body.dueDate === undefined ? task.due_date : req.body.dueDate,
        assigneeId: req.body.assigneeId === undefined ? task.assignee_id : req.body.assigneeId
      };

      const { rows } = await query(
        `UPDATE tasks
         SET title = $1, description = $2, status = $3, priority = $4, due_date = $5,
             assignee_id = $6, updated_at = now()
         WHERE id = $7 AND project_id = $8
         RETURNING *`,
        [
          nextTask.title,
          nextTask.description,
          nextTask.status,
          nextTask.priority,
          nextTask.dueDate || null,
          nextTask.assigneeId || null,
          req.params.taskId,
          req.params.projectId
        ]
      );
      res.json({ task: rows[0] });
    } catch (error) {
      return next(error);
    }
  }
);

app.delete(
  "/api/projects/:projectId/tasks/:taskId",
  requireAuth,
  requireProjectRole,
  requireAdmin,
  async (req, res, next) => {
    try {
      await query("DELETE FROM tasks WHERE id = $1 AND project_id = $2", [req.params.taskId, req.params.projectId]);
      res.status(204).send();
    } catch (error) {
      return next(error);
    }
  }
);

app.get("/api/dashboard", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
        COUNT(t.id)::int AS total_tasks,
        COUNT(t.id) FILTER (WHERE t.status = 'Todo')::int AS todo,
        COUNT(t.id) FILTER (WHERE t.status = 'In Progress')::int AS in_progress,
        COUNT(t.id) FILTER (WHERE t.status = 'Done')::int AS done,
        COUNT(t.id) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status <> 'Done')::int AS overdue,
        COUNT(DISTINCT p.id)::int AS projects
       FROM project_members pm
       JOIN projects p ON p.id = pm.project_id
       LEFT JOIN tasks t ON t.project_id = p.id
       WHERE pm.user_id = $1`,
      [req.user.id]
    );

    const mine = await query(
      `SELECT t.id, t.title, t.status, t.priority, t.due_date, p.name AS project_name, p.id AS project_id
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       JOIN project_members pm ON pm.project_id = p.id
       WHERE pm.user_id = $1 AND t.assignee_id = $1 AND t.status <> 'Done'
       ORDER BY COALESCE(t.due_date, '9999-12-31'::date), t.priority DESC
       LIMIT 8`,
      [req.user.id]
    );

    res.json({ summary: rows[0], myTasks: mine.rows });
  } catch (error) {
    return next(error);
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.use((error, req, res, next) => {
  const status = error.status || 500;
  if (status >= 500) {
    console.error(error);
  }
  res.status(status).json({ message: error.message || "Something went wrong" });
});

migrate()
  .then(() => {
    app.listen(port, () => {
      console.log(`Project tracker running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start app", error);
    process.exit(1);
  });
