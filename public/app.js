const state = {
  token: localStorage.getItem("token"),
  user: JSON.parse(localStorage.getItem("user") || "null"),
  projects: [],
  selectedProjectId: null,
  projectDetail: null,
  dashboard: null
};

const statuses = ["Todo", "In Progress", "Done"];
const priorities = ["Low", "Medium", "High"];

const app = document.querySelector("#app");

function api(path, options = {}) {
  return fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  }).then(async (response) => {
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || "Request failed");
    }
    return data;
  });
}

function setSession(payload) {
  state.token = payload.token;
  state.user = payload.user;
  localStorage.setItem("token", payload.token);
  localStorage.setItem("user", JSON.stringify(payload.user));
}

function logout() {
  state.token = null;
  state.user = null;
  state.projects = [];
  state.selectedProjectId = null;
  state.projectDetail = null;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  renderAuth();
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "No due date";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isOverdue(task) {
  if (!task.due_date || task.status === "Done") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(task.due_date) < today;
}

function roleIsAdmin() {
  return state.projectDetail?.project?.role === "Admin";
}

function notify(message, type = "error") {
  const notice = document.querySelector("#notice");
  if (!notice) return;
  notice.textContent = message;
  notice.className = `notice ${type}`;
  window.setTimeout(() => {
    notice.textContent = "";
    notice.className = "notice";
  }, 3800);
}

async function refresh() {
  if (!state.token) {
    renderAuth();
    return;
  }

  try {
    const [dashboard, projects] = await Promise.all([api("/dashboard"), api("/projects")]);
    state.dashboard = dashboard;
    state.projects = projects.projects;
    if (!state.selectedProjectId && state.projects[0]) {
      state.selectedProjectId = state.projects[0].id;
    }
    if (state.selectedProjectId) {
      await loadProject(state.selectedProjectId, false);
    }
    renderApp();
  } catch (error) {
    logout();
  }
}

async function loadProject(projectId, rerender = true) {
  state.selectedProjectId = projectId;
  const detail = await api(`/projects/${projectId}`);
  state.projectDetail = detail;
  if (rerender) renderApp();
}

function renderAuth(mode = "login") {
  const isSignup = mode === "signup";
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-panel">
        <div>
          <p class="eyebrow">TrackForge</p>
          <h1>Project delivery without the fog.</h1>
          <p class="muted">Create projects, invite teammates, assign work, and see what needs attention before deadlines slip.</p>
        </div>
        <form id="authForm" class="auth-card">
          <div>
            <h2>${isSignup ? "Create account" : "Welcome back"}</h2>
            <p class="muted">${isSignup ? "Start as an Admin on your first project." : "Log in to your workspace."}</p>
          </div>
          ${isSignup ? '<label>Name<input name="name" required minlength="2" autocomplete="name" /></label>' : ""}
          <label>Email<input name="email" required type="email" autocomplete="email" /></label>
          <label>Password<input name="password" required type="password" minlength="${isSignup ? 8 : 1}" autocomplete="${isSignup ? "new-password" : "current-password"}" /></label>
          <button type="submit">${isSignup ? "Sign up" : "Log in"}</button>
          <p id="notice" class="notice"></p>
          <button class="link-button" type="button" id="switchMode">
            ${isSignup ? "Already have an account? Log in" : "Need an account? Sign up"}
          </button>
        </form>
      </section>
    </main>
  `;

  document.querySelector("#switchMode").addEventListener("click", () => renderAuth(isSignup ? "login" : "signup"));
  document.querySelector("#authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const payload = await api(`/auth/${isSignup ? "signup" : "login"}`, {
        method: "POST",
        body: JSON.stringify(body)
      });
      setSession(payload);
      await refresh();
    } catch (error) {
      notify(error.message);
    }
  });
}

function renderApp() {
  const detail = state.projectDetail;
  const project = detail?.project;
  const summary = state.dashboard?.summary || {};
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <span class="mark">TF</span>
          <div><strong>TrackForge</strong><small>${escapeHtml(state.user.name)}</small></div>
        </div>
        <button class="new-project" id="newProjectBtn">+ New project</button>
        <nav class="project-list">
          ${state.projects
            .map(
              (item) => `
                <button class="${item.id === state.selectedProjectId ? "active" : ""}" data-project-id="${item.id}">
                  <span>${escapeHtml(item.name)}</span>
                  <small>${item.done_count}/${item.task_count} done</small>
                </button>
              `
            )
            .join("")}
        </nav>
        <button class="logout" id="logoutBtn">Log out</button>
      </aside>
      <main class="workspace">
        <header class="topbar">
          <div>
            <p class="eyebrow">Dashboard</p>
            <h1>${project ? escapeHtml(project.name) : "Create your first project"}</h1>
          </div>
          ${project ? `<span class="role-pill">${project.role}</span>` : ""}
        </header>

        <section class="metrics">
          ${metric("Projects", summary.projects || 0)}
          ${metric("Tasks", summary.total_tasks || 0)}
          ${metric("In progress", summary.in_progress || 0)}
          ${metric("Overdue", summary.overdue || 0, "danger")}
        </section>

        <div id="notice" class="notice"></div>

        ${
          project
            ? `
          <section class="content-grid">
            <div class="board-panel">
              <div class="section-head">
                <div><h2>Tasks</h2><p class="muted">${escapeHtml(project.description || "No description")}</p></div>
                ${roleIsAdmin() ? '<button id="taskDialogBtn">+ Task</button>' : ""}
              </div>
              <div class="kanban">
                ${statuses.map((status) => taskColumn(status, detail.tasks.filter((task) => task.status === status))).join("")}
              </div>
            </div>
            <aside class="side-panel">
              <div class="section-head">
                <div><h2>Team</h2><p class="muted">${detail.members.length} members</p></div>
              </div>
              <div class="member-list">
                ${detail.members.map(memberRow).join("")}
              </div>
              ${
                roleIsAdmin()
                  ? `
                <form id="memberForm" class="compact-form">
                  <label>Email<input name="email" type="email" required placeholder="teammate@example.com" /></label>
                  <label>Role
                    <select name="role">
                      <option>Member</option>
                      <option>Admin</option>
                    </select>
                  </label>
                  <button type="submit">Add member</button>
                </form>`
                  : ""
              }
              <div class="my-tasks">
                <h2>My Open Tasks</h2>
                ${(state.dashboard?.myTasks || []).map(myTaskRow).join("") || '<p class="muted">No assigned open tasks.</p>'}
              </div>
            </aside>
          </section>
        `
            : `
          <section class="empty-state">
            <h2>Start with a project</h2>
            <p class="muted">Projects hold your team, tasks, due dates, and progress reporting.</p>
            <button id="emptyProjectBtn">Create project</button>
          </section>`
        }
      </main>
    </div>
    ${project ? renderTaskDialog() : ""}
    ${renderProjectDialog()}
  `;

  bindEvents();
}

function metric(label, value, tone = "") {
  return `<article class="metric ${tone}"><small>${label}</small><strong>${value}</strong></article>`;
}

function taskColumn(status, tasks) {
  return `
    <div class="task-column">
      <div class="column-title"><strong>${status}</strong><span>${tasks.length}</span></div>
      <div class="task-stack">
        ${
          tasks
            .map(
              (task) => `
                <article class="task-card ${isOverdue(task) ? "overdue" : ""}">
                  <div class="task-card-head">
                    <strong>${escapeHtml(task.title)}</strong>
                    <span class="priority ${task.priority.toLowerCase()}">${task.priority}</span>
                  </div>
                  <p>${escapeHtml(task.description || "No description")}</p>
                  <div class="task-meta">
                    <span>${escapeHtml(task.assignee_name || "Unassigned")}</span>
                    <span>${formatDate(task.due_date)}</span>
                  </div>
                  ${taskActions(task)}
                </article>
              `
            )
            .join("") || '<p class="muted pad">Nothing here.</p>'
        }
      </div>
    </div>
  `;
}

function taskActions(task) {
  const canUpdateStatus = roleIsAdmin() || task.assignee_id === state.user.id;
  const statusButtons = canUpdateStatus
    ? statuses
        .filter((status) => status !== task.status)
        .map((status) => `<button class="ghost small" data-task-status="${status}" data-task-id="${task.id}">${status}</button>`)
        .join("")
    : "";
  const deleteButton = roleIsAdmin() ? `<button class="ghost small danger-text" data-delete-task="${task.id}">Delete</button>` : "";
  return statusButtons || deleteButton ? `<div class="task-actions">${statusButtons}${deleteButton}</div>` : "";
}

function memberRow(member) {
  const removeButton =
    roleIsAdmin() && member.id !== state.user.id
      ? `<button class="icon-button" title="Remove member" data-remove-member="${member.id}">×</button>`
      : "";
  return `
    <div class="member-row">
      <div><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.email)}</small></div>
      <span>${member.role}</span>
      ${removeButton}
    </div>
  `;
}

function myTaskRow(task) {
  return `
    <button class="my-task" data-project-id="${task.project_id}">
      <strong>${escapeHtml(task.title)}</strong>
      <small>${escapeHtml(task.project_name)} · ${formatDate(task.due_date)}</small>
    </button>
  `;
}

function renderProjectDialog() {
  return `
    <dialog id="projectDialog">
      <form id="projectForm" method="dialog" class="dialog-form">
        <h2>New project</h2>
        <label>Name<input name="name" required minlength="2" maxlength="120" /></label>
        <label>Description<textarea name="description" maxlength="1000"></textarea></label>
        <div class="dialog-actions">
          <button type="button" class="ghost" data-close-dialog>Cancel</button>
          <button type="submit">Create</button>
        </div>
      </form>
    </dialog>
  `;
}

function renderTaskDialog() {
  const members = state.projectDetail.members;
  return `
    <dialog id="taskDialog">
      <form id="taskForm" method="dialog" class="dialog-form">
        <h2>New task</h2>
        <label>Title<input name="title" required minlength="2" maxlength="160" /></label>
        <label>Description<textarea name="description" maxlength="1500"></textarea></label>
        <div class="two-col">
          <label>Assignee
            <select name="assigneeId">
              <option value="">Unassigned</option>
              ${members.map((member) => `<option value="${member.id}">${escapeHtml(member.name)}</option>`).join("")}
            </select>
          </label>
          <label>Due date<input name="dueDate" type="date" /></label>
        </div>
        <div class="two-col">
          <label>Status
            <select name="status">${statuses.map((status) => `<option>${status}</option>`).join("")}</select>
          </label>
          <label>Priority
            <select name="priority">${priorities.map((priority) => `<option>${priority}</option>`).join("")}</select>
          </label>
        </div>
        <div class="dialog-actions">
          <button type="button" class="ghost" data-close-dialog>Cancel</button>
          <button type="submit">Create task</button>
        </div>
      </form>
    </dialog>
  `;
}

function bindEvents() {
  document.querySelector("#logoutBtn")?.addEventListener("click", logout);
  document.querySelector("#newProjectBtn")?.addEventListener("click", () => document.querySelector("#projectDialog").showModal());
  document.querySelector("#emptyProjectBtn")?.addEventListener("click", () => document.querySelector("#projectDialog").showModal());
  document.querySelector("#taskDialogBtn")?.addEventListener("click", () => document.querySelector("#taskDialog").showModal());

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });

  document.querySelectorAll("[data-project-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await loadProject(button.dataset.projectId);
    });
  });

  document.querySelector("#projectForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const { project } = await api("/projects", { method: "POST", body: JSON.stringify(body) });
      state.selectedProjectId = project.id;
      document.querySelector("#projectDialog").close();
      await refresh();
    } catch (error) {
      notify(error.message);
    }
  });

  document.querySelector("#memberForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await api(`/projects/${state.selectedProjectId}/members`, { method: "POST", body: JSON.stringify(body) });
      await refresh();
      notify("Member updated", "success");
    } catch (error) {
      notify(error.message);
    }
  });

  document.querySelector("#taskForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formBody = Object.fromEntries(new FormData(event.currentTarget).entries());
    const body = {
      ...formBody,
      assigneeId: formBody.assigneeId || null,
      dueDate: formBody.dueDate || null
    };
    try {
      await api(`/projects/${state.selectedProjectId}/tasks`, { method: "POST", body: JSON.stringify(body) });
      document.querySelector("#taskDialog").close();
      await refresh();
      notify("Task created", "success");
    } catch (error) {
      notify(error.message);
    }
  });

  document.querySelectorAll("[data-task-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/projects/${state.selectedProjectId}/tasks/${button.dataset.taskId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: button.dataset.taskStatus })
        });
        await refresh();
      } catch (error) {
        notify(error.message);
      }
    });
  });

  document.querySelectorAll("[data-delete-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/projects/${state.selectedProjectId}/tasks/${button.dataset.deleteTask}`, { method: "DELETE" });
        await refresh();
      } catch (error) {
        notify(error.message);
      }
    });
  });

  document.querySelectorAll("[data-remove-member]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/projects/${state.selectedProjectId}/members/${button.dataset.removeMember}`, { method: "DELETE" });
        await refresh();
      } catch (error) {
        notify(error.message);
      }
    });
  });
}

refresh();
