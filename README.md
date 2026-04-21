<div align="center">
<img src="https://img.shields.io/badge/PomoPal-Backend%20API-FF6B6B?style=for-the-badge&logo=nestjs&logoColor=white" alt="PomoPal Backend"/>
# 🍅 PomoPal — Backend

**NestJS REST API powering the PomoPal Pomodoro timer app.**

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://claude.ai/LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://claude.ai/CONTRIBUTING.md)
[![Status](https://img.shields.io/badge/Status-In%20Development-yellow)](https://claude.ai/chat/f006922e-8144-45d6-a076-37d85fb0f5ce)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://claude.ai/chat/f006922e-8144-45d6-a076-37d85fb0f5ce)
[![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white)](https://claude.ai/chat/f006922e-8144-45d6-a076-37d85fb0f5ce)

[🌐 Frontend Repo](https://github.com/eclipsu/pomopal "Frontend Repo") · [🐛 Report a Bug](https://github.com/eclipsu/pomopal-backend/issues) · [💡 Request a Feature](https://github.com/eclipsu/pomopal-backend/issues)

</div>
---

📖 Overview

This is the backend API for [PomoPal](https://pomopal.vercel.app/). It handles user authentication (JWT + Google OAuth), Pomodoro session tracking, daily analytics, streaks, and user settings. Built with **NestJS** and backed by  **PostgreSQL** , it runs fully containerized via  **Docker Compose** .

---

## 🛠️ Tech Stack

| Layer     | Technology                        |
| --------- | --------------------------------- |
| Framework | NestJS                            |
| Language  | TypeScript                        |
| Database  | PostgreSQL                        |
| ORM       | TypeORM                           |
| Auth      | JWT + Google OAuth 2.0 + Passport |
| Container | Docker & Docker Compose           |
| Port      | `3000`                          |

---

## 📁 Project Structure

```
/
├── src/
│   ├── auth/          # JWT, Google OAuth, Passport strategies
│   ├── sessions/      # Pomodoro session CRUD
│   ├── analytics/     # Daily stats and calendar view
│   ├── streaks/       # Streak tracking
│   ├── user/          # User profile and settings
│   └── app.module.ts  # Root module
├── .env               # Your local secrets (gitignored)
├── .env.example       # Safe template to copy from
├── docker-compose.yml
├── Dockerfile
└── package.json
```

---

## ⚙️ Local Setup

### Prerequisites

* [Docker](https://www.docker.com/get-started) & Docker Compose installed and running
* [Git](https://git-scm.com/)

---

### Step 1 — Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/pomopal.git
cd pomopal/backend
```

---

### Step 2 — Create your `.env` file

Copy the example file as a starting point:

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```dotenv
# ─────────────────────────────────────────
# Database
# ─────────────────────────────────────────
DB_HOST=localhost
DB_PORT=5431
DB_USER=postgres
DB_PASSWORD=your_database_password
DB_NAME=pomopal
DATABASE_URL='postgresql://postgres:your_database_password@localhost:5431/pomopal'

# ─────────────────────────────────────────
# JSON Web Tokens (Auth)
# ─────────────────────────────────────────
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=60s
REFRESH_JWT_SECRET=your_refresh_jwt_secret_here
REFRESH_TOKEN_EXPIRES_IN=12d

# ─────────────────────────────────────────
# Google OAuth — see Step 3 for how to get these
# ─────────────────────────────────────────
GOOGLE_OAUTH_CLIENT_ID=your_google_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_google_client_secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/auth/google/callback

# ─────────────────────────────────────────
# Environment
# ─────────────────────────────────────────
NODE_ENV='development'
```

> 🔒 **Never commit your `.env` file.** It is already in `.gitignore`. Only `.env.example` should ever be committed.

---

### Step 3 — Set up Google OAuth credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown → **New Project** → name it → **Create**
3. Sidebar → **APIs & Services → OAuth consent screen**
   * Choose **External** → fill in app name and your email → **Save & Continue**
4. Sidebar → **APIs & Services → Credentials**
5. Click **+ Create Credentials → OAuth 2.0 Client ID**
6. Set **Application type** to **Web application**
7. Under **Authorized redirect URIs** add:
   ```
   http://localhost:3000/auth/google/callback
   ```
8. Click **Create** — copy the **Client ID** and **Client Secret** into your `.env`

---

### Step 4 — Start with Docker Compose

```bash
docker compose up --build
```

This spins up both the **NestJS app** and the **PostgreSQL database** together. You should see:

```
nest_app    | Server running on port 3000
postgres_db | database system is ready to accept connections
```

The API is now live at **`http://localhost:3000`**

To stop:

```bash
docker compose down
```

---

## 🗺️ API Routes

Base URL: `http://localhost:3000`

> 🔐 Routes marked with **[Auth]** require a Bearer token in the `Authorization` header.

---

### Health Check

| Method  | Route | Auth | Description                    |
| ------- | ----- | ---- | ------------------------------ |
| `GET` | `/` | ❌   | Confirms the server is running |

---

### Auth — `/auth`

| Method   | Route                     | Auth | Description                                                  |
| -------- | ------------------------- | ---- | ------------------------------------------------------------ |
| `POST` | `/auth/login`           | ❌   | Login with email & password, returns access + refresh tokens |
| `GET`  | `/auth/google/login`    | ❌   | Redirect to Google OAuth consent screen                      |
| `GET`  | `/auth/google/callback` | ❌   | Google OAuth callback (handled automatically)                |
| `GET`  | `/auth/me`              | 🔐   | Get the currently logged-in user                             |
| `POST` | `/auth/refresh`         | ❌   | Exchange a refresh token for a new access token              |
| `POST` | `/auth/logout`          | 🔐   | Logout and invalidate the refresh token                      |

---

### User — `/user`

| Method     | Route              | Auth | Description                                        |
| ---------- | ------------------ | ---- | -------------------------------------------------- |
| `POST`   | `/user`          | ❌   | Register a new user                                |
| `GET`    | `/user`          | 🔐   | Get all users                                      |
| `GET`    | `/user/profile`  | 🔐   | Get your own profile                               |
| `GET`    | `/user/:id`      | 🔐   | Get a specific user by ID                          |
| `PATCH`  | `/user/settings` | 🔐   | Update timer settings (focus/break durations etc.) |
| `PATCH`  | `/user/timezone` | 🔐   | Update your timezone                               |
| `DELETE` | `/user/:id`      | 🔐   | Delete a user by ID                                |

---

### Sessions — `/sessions`

| Method    | Route                      | Auth | Description                  |
| --------- | -------------------------- | ---- | ---------------------------- |
| `POST`  | `/sessions`              | 🔐   | Start a new Pomodoro session |
| `GET`   | `/sessions`              | 🔐   | Get all your sessions        |
| `PATCH` | `/sessions/:id/complete` | 🔐   | Mark a session as complete   |

---

### Analytics — `/analytics`

| Method  | Route                   | Auth | Description                                 |
| ------- | ----------------------- | ---- | ------------------------------------------- |
| `GET` | `/analytics/daily`    | 🔐   | Get today's focus stats                     |
| `GET` | `/analytics/calendar` | 🔐   | Get activity data for calendar/heatmap view |

---

### Streaks — `/streaks`

| Method  | Route        | Auth | Description                         |
| ------- | ------------ | ---- | ----------------------------------- |
| `GET` | `/streaks` | 🔐   | Get your current and longest streak |

---

## 🧪 Testing with Postman

### Initial Setup

1. Download and install [Postman](https://www.postman.com/downloads/)
2. Create an environment to store your base URL and token:

   * Click **Environments** (top right) → **+** → name it `PomoPal Local`
   * Add these two variables:

   | Variable    | Initial Value             |
   | ----------- | ------------------------- |
   | `baseUrl` | `http://localhost:3000` |
   | `token`   | *(leave empty for now)* |


   * Click  **Save** , then select `PomoPal Local` from the environment dropdown (top right)
3. Now use `{{baseUrl}}` in all your request URLs

---

### 1 — Register a new user

`POST {{baseUrl}}/user`

**Headers:**

```
Content-Type: application/json
```

**Body** (raw → JSON):

```json
{
  "email": "test@example.com",
  "password": "yourpassword123",
  "name": "Test User"
}
```

---

### 2 — Login and save your token

`POST {{baseUrl}}/auth/login`

**Headers:**

```
Content-Type: application/json
```

**Body** (raw → JSON):

```json
{
  "email": "test@example.com",
  "password": "yourpassword123"
}
```

**Response:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
}
```

> 💡 **Auto-save your token:** In this request go to the **Tests** tab and paste this script. It will automatically save the token to your environment after every login so you never have to copy-paste it manually:
>
> ```javascript
> const res = pm.response.json();
> pm.environment.set("token", res.access_token);
> pm.environment.set("refresh_token", res.refresh_token);
> ```

---

### 3 — Authorize protected requests

For every 🔐 route, go to the **Authorization** tab in Postman:

* Type: **Bearer Token**
* Token: `{{token}}`

Or add it manually as a header:

```
Authorization: Bearer {{token}}
```

---

### 4 — Try the routes

**Get your profile**

`GET {{baseUrl}}/user/profile`

---

**Start a Pomodoro session**

`POST {{baseUrl}}/sessions`

Body:

```json
{
  "duration": 25,
  "type": "focus"
}
```

---

**Complete a session**

`PATCH {{baseUrl}}/sessions/:id/complete`

Replace `:id` with the session ID returned when you created it. No body needed.

---

**Get today's analytics**

`GET {{baseUrl}}/analytics/daily`

---

**Get calendar activity**

`GET {{baseUrl}}/analytics/calendar`

---

**Get your streak**

`GET {{baseUrl}}/streaks`

---

**Update timer settings**

`PATCH {{baseUrl}}/user/settings`

Body:

```json
{
  "focusDuration": 25,
  "shortBreak": 5,
  "longBreak": 15
}
```

---

**Update timezone**

`PATCH {{baseUrl}}/user/timezone`

Body:

```json
{
  "timezone": "America/New_York"
}
```

---

### 5 — Refresh your access token

Access tokens expire in `60s`. When a request returns `401 Unauthorized`, use your refresh token to get a new access token:

`POST {{baseUrl}}/auth/refresh`

Body:

```json
{
  "refresh_token": "{{refresh_token}}"
}
```

Copy the new `access_token` into your `token` environment variable (or update your Tests script to do it automatically).

---

### 6 — Google OAuth (browser only)

Google OAuth requires a browser redirect and can't be triggered directly from Postman. To test it:

1. Make sure the backend is running
2. Open your browser and navigate to:
   ```
   http://localhost:3000/auth/google/login
   ```
3. You'll be redirected to Google's consent screen → sign in → redirected back via the callback URL

---

## 🔑 Environment Variables Reference

| Variable                       | Description                       | Example                                        |
| ------------------------------ | --------------------------------- | ---------------------------------------------- |
| `DB_HOST`                    | Database host                     | `localhost`                                  |
| `DB_PORT`                    | Database port                     | `5431`                                       |
| `DB_USER`                    | Database username                 | `postgres`                                   |
| `DB_PASSWORD`                | Database password                 | `yourpassword`                               |
| `DB_NAME`                    | Database name                     | `pomopal`                                    |
| `DATABASE_URL`               | Full Postgres connection string   | `postgresql://...`                           |
| `JWT_SECRET`                 | Secret for signing access tokens  | any long random string                         |
| `JWT_EXPIRES_IN`             | Access token expiry               | `60s`                                        |
| `REFRESH_JWT_SECRET`         | Secret for signing refresh tokens | any long random string                         |
| `REFRESH_TOKEN_EXPIRES_IN`   | Refresh token expiry              | `12d`                                        |
| `GOOGLE_OAUTH_CLIENT_ID`     | Google OAuth client ID            | from Google Cloud Console                      |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth client secret        | from Google Cloud Console                      |
| `GOOGLE_OAUTH_REDIRECT_URI`  | OAuth callback URL                | `http://localhost:3000/auth/google/callback` |
| `NODE_ENV`                   | Runtime environment               | `development`                                |

---

## 🤝 Contributing

Contributions are welcome! Every merged PR earns you the 🧑🏻‍💻 **Developer** badge on your profile.

```bash
git checkout -b feature/your-feature-name
# Use prefixes: feature/, fix/, or chore/

git add .
git commit -m "feat: describe your change"
git push origin feature/your-feature-name
# Then open a Pull Request on GitHub
```

If your PR fixes an open issue, reference it in your message: `Fixes #42`

---

## 📄 License

PomoPal is licensed under the [MIT License](https://claude.ai/LICENSE).

---

<div align="center">
Made with ❤️ by students, for students.

</div>
