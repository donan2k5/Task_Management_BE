# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Time Management Backend** - A NestJS REST API for task and project management with MongoDB, supporting calendar views, project tracking, and dashboard analytics.

## Common Commands

```bash
npm run start:dev    # Start dev server with hot reload (http://localhost:3000)
npm run start        # Start production server
npm run build        # Build for production
npm run lint         # Run ESLint with auto-fix
npm run test         # Run unit tests
npm run test:e2e     # Run end-to-end tests
```

## Tech Stack

- **NestJS 11** with TypeScript
- **Database:** MongoDB via Mongoose 9
- **Validation:** class-validator + class-transformer
- **Config:** @nestjs/config with .env support

## Architecture

### Directory Structure

```
src/
├── main.ts              # Application entry point (CORS, ValidationPipe)
├── app.module.ts        # Root module with HTTP logging middleware
├── users/               # User management module
├── tasks/               # Task CRUD with calendar/scheduling
├── projects/            # Project management with stats
├── dashboard/           # Aggregated dashboard data
└── common/middleware/   # Shared middleware
```

### Module Pattern

Each feature follows NestJS module structure:
- `*.module.ts` - Module definition
- `*.controller.ts` - Route handlers
- `*.service.ts` - Business logic
- `schemas/*.schema.ts` - Mongoose schemas
- `dto/*.dto.ts` - Data transfer objects with validation

### Data Models

**Task** (`tasks/schemas/task.schema.ts`)
- `title`, `description`, `project`
- `scheduledDate` - Start date/time for the task (includes time component)
- `scheduledEndDate` - End date/time for calendar event duration
- `deadline` - User-set due date (independent of calendar event duration, NOT populated from Google Calendar)
- `isUrgent`, `isImportant`, `completed`
- `status`: backlog | todo | done

**Project** (`projects/schemas/project.schema.ts`)
- `name`, `description`, `coverImage`
- `progress` (0-100), `dueDate`
- `status`: active | completed | archived
- `color`, `icon`

**User** (`users/user.schema.ts`)
- `name`, `email`
- `googleId`, `accessToken`, `refreshToken`, `tokenExpiry` - Google OAuth
- `dedicatedCalendarId` - Single "Axis" calendar for all tasks
- `autoSyncEnabled` - Whether bidirectional sync is active
- `webhookChannelId`, `webhookResourceId`, `webhookExpiration` - Google push notifications

## Google Calendar Sync Architecture

The app uses a **Single Dedicated Calendar Model**:
- One calendar named "Axis" per user for all tasks from all projects
- Bidirectional sync: App ↔ Google Calendar
- Tasks identified via `extendedProperties.private.axis_task_id` and `axis_project_id`
- Events created in Google without a project go to "Inbox" project

**Sync Flow:**
1. User connects Google → Creates "Axis" calendar + enables webhook
2. Task CRUD → Auto-syncs to Google Calendar
3. Google event changes → Webhook triggers sync to app

## API Endpoints

| Module | Endpoint | Methods |
|--------|----------|---------|
| Tasks | `/tasks` | GET, POST |
| | `/tasks/:id` | GET, PATCH, DELETE |
| | `/tasks/calendar?start=&end=` | GET |
| | `/tasks/unscheduled` | GET |
| Projects | `/projects` | GET, POST |
| | `/projects/:id` | GET, PATCH, DELETE |
| | `/projects/stats` | GET |
| Dashboard | `/dashboard/summary` | GET |
| Users | `/users` | GET, POST |
| | `/users/:id` | GET, PUT, DELETE |
| Auth | `/auth/google` | GET (OAuth initiate) |
| | `/auth/google/callback` | GET (OAuth callback) |
| | `/auth/google/status/:userId` | GET |
| | `/auth/google/disconnect/:userId` | DELETE |
| Sync | `/sync/initialize?userId=` | POST |
| | `/sync/status?userId=` | GET |
| | `/sync/disconnect?userId=` | DELETE |
| | `/sync/task/:taskId?userId=` | POST |
| | `/sync/from-google?userId=` | POST |
| | `/sync/webhook/enable?userId=` | POST |
| Webhook | `/webhook/google-calendar` | POST (Google push) |

## Environment Variables

Required in `.env`:
```
MONGO_URI=mongodb+srv://...
PORT=3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
FRONTEND_URL=http://localhost:8081
WEBHOOK_BASE_URL=https://your-domain.com  # For Google push notifications
APP_CALENDAR_NAME=Axis  # Optional, defaults to "Axis"
```

## Development Rules

### Code Quality
- Use NestJS decorators and DI patterns
- Validate DTOs with class-validator decorators
- Keep controllers thin, business logic in services
- Use Mongoose schemas with proper typing

### Pre-commit Rules
- **DO NOT** commit `.env` or any credentials
- Keep commits focused and use conventional commit format
- No AI attribution signatures in commits

### Docker
- Use `Dockerfile` for containerized deployment
