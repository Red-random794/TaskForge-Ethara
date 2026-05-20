# TrackForge

TrackForge is a full-stack project management app where users can sign up, create projects, invite team members, assign tasks, and track progress with Admin/Member role-based access.

## Features

- JWT authentication with signup and login
- PostgreSQL-backed REST API
- Project creation and member management
- Admin/Member project roles
- Task creation, assignment, priority, due date, and status tracking
- Dashboard summary for total, in-progress, completed, and overdue tasks
- Server-side validation with Zod and relational database constraints

## Tech Stack

- Node.js 20
- Express
- PostgreSQL
- `pg`
- JWT
- bcrypt
- Zod
- HTML/CSS/JavaScript frontend served by Express

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` from the example:

   ```bash
   cp .env.example .env
   ```

3. Set `DATABASE_URL` to a PostgreSQL database and set a long `JWT_SECRET`.

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000`.

The server runs migrations automatically on startup.

## Railway Deployment

1. Push this repository to GitHub.
2. Create a new Railway project from the GitHub repo.
3. Add a Railway PostgreSQL database.
4. In the web service, set these variables:

   ```bash
   DATABASE_URL=${{ Postgres.DATABASE_URL }}
   JWT_SECRET=<long-random-secret>
   NODE_ENV=production
   ```

5. Railway will run `npm install` and `npm start`.

## REST API

### Auth

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/me`

### Projects

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`

### Team

- `POST /api/projects/:projectId/members` Admin only
- `DELETE /api/projects/:projectId/members/:userId` Admin only

### Tasks

- `POST /api/projects/:projectId/tasks` Admin only
- `PATCH /api/projects/:projectId/tasks/:taskId` Admins can edit all fields; Members can update status only for assigned tasks
- `DELETE /api/projects/:projectId/tasks/:taskId` Admin only

### Dashboard

- `GET /api/dashboard`

## Submission

- Live URL: Add the Railway public URL after deployment.
- GitHub repo: Add the repository URL after pushing.
