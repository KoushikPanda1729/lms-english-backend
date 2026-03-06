# English Speaking Practice Platform — Backend

Real-time English speaking practice platform. Students find random partners and
practice speaking. Built with Node.js, Fastify, TypeORM, PostgreSQL, Redis, Socket.io.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Architecture Overview](#architecture-overview)
3. [Project Structure](#project-structure)
4. [Environment Variables](#environment-variables)
5. [Development Setup](#development-setup)
6. [Code Quality Tools](#code-quality-tools)
7. [Database and Migrations](#database-and-migrations)
8. [Build Order](#build-order)
9. [Module 01 — Project Bootstrap](#module-01--project-bootstrap)
10. [Module 02 — Auth](#module-02--auth)
11. [Module 03 — Users and Profiles](#module-03--users-and-profiles)
12. [Module 04 — Matchmaking](#module-04--matchmaking)
13. [Module 05 — WebRTC Signaling](#module-05--webrtc-signaling)
14. [Module 06 — Call Sessions](#module-06--call-sessions)
15. [Module 07 — Reports and Safety](#module-07--reports-and-safety)
16. [Module 08 — Payments (Stripe)](#module-08--payments-stripe)
17. [Module 09 — Notifications](#module-09--notifications)
18. [Module 10 — Admin](#module-10--admin)
19. [Module 11 — LMS Phase 2](#module-11--lms-phase-2)
20. [Infrastructure — STUN/TURN Coturn](#infrastructure--stunturn-coturn)
21. [Infrastructure — Video and File Storage](#infrastructure--video-and-file-storage)
22. [Dependency Injection Strategy](#dependency-injection-strategy)
23. [Payment Strategy Pattern](#payment-strategy-pattern)
24. [Idempotency Strategy](#idempotency-strategy)
25. [Security Checklist](#security-checklist)

---

## Tech Stack

| Layer            | Technology                        | Reason                                          |
|------------------|-----------------------------------|-------------------------------------------------|
| Runtime          | Node.js 20 LTS (.nvmrc)           | Stable LTS                                      |
| Framework        | Fastify                           | Faster than Express, schema validation built-in |
| Language         | TypeScript                        | Type safety, better DX                          |
| ORM              | TypeORM                           | Migration support, decorator-based entities     |
| Primary DB       | PostgreSQL 16 (Docker)            | Relational, ACID compliant                      |
| Cache / Queue    | Redis 7 (Docker)                  | Matchmaking queue, idempotency, rate limit      |
| Realtime         | Socket.io                         | WebRTC signaling, matchmaking events            |
| Auth             | JWT RS256 + JWKS                  | Asymmetric keys, key rotation, standard         |
| Password         | bcrypt 12 rounds                  | Industry standard                               |
| Validation       | Zod                               | Runtime type validation on all inputs           |
| Payment          | Stripe Checkout Session           | success_url + cancel_url flow, webhook          |
| Push Notifs      | Firebase Admin SDK (FCM)          | Free, works for Flutter iOS + Android           |
| File Storage     | Cloudflare R2 or MinIO            | S3-compatible, cheap egress                     |
| Email            | Resend                            | Simple API, good free tier                      |
| STUN/TURN        | Coturn self-hosted VPS            | Full control, no per-minute cost                |
| Reverse Proxy    | Nginx                             | TLS termination, WebSocket proxy                |
| Containers       | Docker + Docker Compose           | Local dev + production                          |

---

## Architecture Overview

```
┌───────────────────────────────────────────────────────────┐
│                       CLIENTS                             │
│        Flutter Mobile              Next.js Web            │
└────────────┬──────────────────────────┬───────────────────┘
             │ REST (HTTPS)             │ Socket.io (WSS)
             ▼                          ▼
┌───────────────────────────────────────────────────────────┐
│                  Nginx (Reverse Proxy)                    │
└───────────────────────────┬───────────────────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────┐
│              Fastify Backend  port 5503                   │
│                                                           │
│  Auth │ Users │ Match │ Signal │ Sessions │ Pay │ Admin   │
└──┬────┴──┬────┴──┬─────┴───┬────┴────┬─────┴─┬───┴──┬────┘
   │       │       │         │         │       │      │
   ▼       ▼       ▼         ▼         ▼       ▼      ▼
  PG      PG     Redis     Redis       PG      PG     PG

                      ┌──────────────┐
                      │   Coturn     │  STUN/TURN
                      │  (your VPS)  │
                      └──────────────┘

                      ┌──────────────┐
                      │  R2 / MinIO  │  File + Video Storage
                      └──────────────┘

                      ┌──────────────┐
                      │   Stripe     │  Payment + Webhooks
                      └──────────────┘
```

---

## Project Structure

```
backend/
├── .nvmrc                              Node version: 20.11.0
├── .env                                local env (gitignored)
├── .env.example                        committed template
├── .prettierrc                         Prettier config
├── .eslintrc.js                        ESLint config
├── .lintstagedrc.js                    only lint staged files
├── .gitignore
├── .husky/
│   └── pre-commit                      runs lint-staged before every commit
├── package.json                        scripts: dev, build, lint, format, migration
├── tsconfig.json
├── data-source.ts                      TypeORM CLI entry point (root level, required)
├── docker-compose.yml                  PostgreSQL + Redis for local dev
├── scripts/
│   └── generate-keys.js               generates RSA key pair into ./keys/
├── keys/
│   ├── private.pem                     gitignored — signs JWT
│   └── public.pem                      can be public — verifies JWT
└── src/
    ├── main.ts                         starts server, connects DB + Redis
    ├── app.ts                          Fastify instance, registers plugins + routes
    ├── container.ts                    manual DI wiring via constructor injection
    ├── config/
    │   ├── env.config.ts               parse + validate all env vars with Zod
    │   ├── database.config.ts          TypeORM DataSource options
    │   └── redis.config.ts             ioredis client instance
    ├── entities/
    │   ├── User.entity.ts
    │   ├── RefreshToken.entity.ts
    │   ├── PasswordResetToken.entity.ts
    │   ├── Profile.entity.ts
    │   ├── CallSession.entity.ts
    │   ├── SessionRating.entity.ts
    │   ├── Report.entity.ts
    │   ├── Order.entity.ts
    │   ├── DeviceToken.entity.ts
    │   ├── Notification.entity.ts
    │   ├── Course.entity.ts            Phase 2
    │   ├── Lesson.entity.ts            Phase 2
    │   └── Enrollment.entity.ts        Phase 2
    ├── migrations/                     auto-generated by TypeORM CLI
    ├── middleware/
    │   ├── auth.middleware.ts           verify JWT, attach user to request
    │   └── role.middleware.ts           guard route by role
    ├── shared/
    │   ├── errors.ts                   custom AppError classes
    │   └── response.ts                 standard response shape helpers
    └── modules/
        ├── well-known/
        │   └── jwks.routes.ts          GET /.well-known/jwks.json
        ├── auth/
        │   ├── interfaces/
        │   │   └── auth.interface.ts
        │   ├── jwt.util.ts             sign + verify JWT with RS256
        │   ├── auth.service.ts
        │   ├── auth.controller.ts
        │   └── auth.routes.ts
        ├── users/
        │   ├── user.service.ts
        │   ├── user.controller.ts
        │   └── user.routes.ts
        ├── matchmaking/
        │   ├── matchmaking.service.ts
        │   └── matchmaking.gateway.ts  Socket.io events
        ├── signaling/
        │   └── signaling.gateway.ts    Socket.io WebRTC relay
        ├── sessions/
        │   ├── session.service.ts
        │   ├── session.controller.ts
        │   └── session.routes.ts
        ├── reports/
        │   ├── report.service.ts
        │   ├── report.controller.ts
        │   └── report.routes.ts
        ├── payment/
        │   ├── interfaces/
        │   │   └── payment.provider.interface.ts
        │   ├── providers/
        │   │   ├── stripe.provider.ts
        │   │   └── razorpay.provider.ts  ready when needed
        │   ├── payment.factory.ts
        │   ├── payment.service.ts
        │   ├── payment.controller.ts
        │   ├── webhook.controller.ts    handles POST /payments/webhook
        │   └── payment.routes.ts
        ├── notifications/
        │   ├── notification.service.ts
        │   ├── notification.controller.ts
        │   └── notification.routes.ts
        └── admin/
            ├── admin.controller.ts
            └── admin.routes.ts
```

---

## Environment Variables

```env
# Server
NODE_ENV=development
PORT=5503
APP_URL=http://localhost:5503

# Database (matches existing Docker setup, DB_NAME changed)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=root
DB_PASSWORD=root
DB_NAME=english_speaking_dev

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT RS256
JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=30d
JWT_KEY_ID=key-v1

# TURN Server (Coturn HMAC)
TURN_SECRET=your_hmac_secret
TURN_HOST=turn.yourdomain.com
TURN_PORT=3478

# Payment
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx         from: stripe listen --forward-to localhost:5503/payments/webhook
STRIPE_SUCCESS_URL=http://localhost:3000/payment/success
STRIPE_CANCEL_URL=http://localhost:3000/payment/cancel

# Firebase FCM
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# File Storage (R2 or MinIO)
STORAGE_ENDPOINT=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
STORAGE_BUCKET_NAME=
STORAGE_PUBLIC_URL=

# Email
RESEND_API_KEY=
EMAIL_FROM=noreply@yourdomain.com
```

---

## Development Setup

### Prerequisites

- nvm installed
- Docker + Docker Compose
- Stripe CLI (for local webhook testing)

### Steps

```bash
nvm use                               reads .nvmrc, switches to Node 20.11.0
npm install
cp .env.example .env                  fill in your values
docker-compose up -d                  starts PostgreSQL + Redis
npm run keys:generate                 generates RSA key pair in ./keys/
npm run migration:run                 runs all pending migrations
npm run dev                           starts dev server on port 5503

# In a separate terminal for Stripe webhooks:
c
# Copy the webhook secret printed by stripe listen into STRIPE_WEBHOOK_SECRET in .env
```

---

## Code Quality Tools

### npm scripts

```
npm run dev               start dev server with hot reload
npm run build             compile TypeScript to dist/
npm run start             run compiled dist/main.js

npm run lint              check ESLint errors
npm run lint:fix          auto-fix ESLint errors
npm run format:check      check Prettier formatting
npm run format:fix        auto-fix Prettier formatting
```

### Pre-commit hook

Husky runs lint-staged on every `git commit`.
lint-staged runs `eslint --fix` and `prettier --write` on staged `.ts` files only.
Commit is blocked if lint errors remain after auto-fix.

### Commit message convention

```
feat: add matchmaking queue
fix: refresh token not rotating
chore: update dependencies
refactor: extract payment factory
```

---

## Database and Migrations

`synchronize: false` always. Never let TypeORM auto-sync schema. Migrations only.

### Commands

```bash
npm run migration:generate --name=CreateUsers        auto-diff from entities
npm run migration:create   --name=AddIndexToProfile  blank file for manual SQL
npm run migration:run                                 run all pending
npm run migration:revert                              rollback last
npm run migration:show                                list all + status
```

### Rules

- Never edit a migration file that has already been run
- Every schema change = a new migration file
- All migration files are committed to git
- Run `migration:run` in CI/CD before deploying new code
- Migration filenames are timestamped automatically by TypeORM

### data-source.ts (root level)

This file is required at the project root so the TypeORM CLI can find the DataSource.
It imports the same DataSource used by the app.
`entities` and `migrations` paths must point to `.ts` files for CLI, `.js` for compiled.

---

## Build Order

Build and fully test each module before starting the next.

```
Phase 1 — Core
  Module 01   Project Bootstrap      (setup, config, docker, keys, migrations base)
  Module 02   Auth                   (register, login, refresh, logout, JWKS)
  Module 03   Users and Profiles     (profile CRUD, avatar upload)
  Module 04   Matchmaking            (Redis queue, Socket.io pairing)
  Module 05   WebRTC Signaling       (offer/answer/ICE relay via Socket.io)
  Module 06   Call Sessions          (track duration, rating after call)
  Module 07   Reports and Safety     (report user, admin review, ban)

Phase 2 — Monetisation
  Module 08   Payments Stripe        (Checkout Session, webhook, orders)
  Module 09   Notifications          (FCM push, in-app notifications)
  Module 10   Admin                  (dashboard, user management, reports)

Phase 3 — LMS
  Module 11   LMS                    (courses, lessons, video, enrollment, progress)
```

---

## Module 01 — Project Bootstrap

### What to create

```
.nvmrc
package.json
tsconfig.json
.prettierrc
.eslintrc.js
.lintstagedrc.js
.gitignore
.env.example
docker-compose.yml
data-source.ts
scripts/generate-keys.js
src/main.ts               (bare Fastify server, health check only)
src/app.ts
src/config/env.config.ts
src/config/database.config.ts
src/config/redis.config.ts
src/shared/errors.ts
src/shared/response.ts
```

### docker-compose.yml structure

Two services: `postgres` and `redis`.
PostgreSQL uses credentials from env: username=root, password=root, db=english_speaking_dev.
Same pattern as your existing DB image. Redis with no password for local dev.
Both services have named volumes so data persists across restarts.
Expose 5432 and 6379 to localhost.

### Key Generation (scripts/generate-keys.js)

Script generates a 2048-bit RSA key pair.
Saves `private.pem` and `public.pem` into `./keys/` directory.
`./keys/private.pem` must be in `.gitignore`.
Run once: `npm run keys:generate`.
On production: generate keys on server, never copy from dev machine.

### Health Check

`GET /health` returns `{ status: "ok", timestamp }`.
No auth. Used by load balancer and Docker healthcheck.

### Verify Bootstrap Works

```bash
npm run dev
curl http://localhost:5503/health    should return 200
```

---

## Module 02 — Auth

### Endpoints

```
POST   /auth/register
POST   /auth/login
POST   /auth/logout
POST   /auth/refresh
POST   /auth/forgot-password
POST   /auth/reset-password
GET    /.well-known/jwks.json
```

### Entities

**User**
```
id                UUID           primary key
email             VARCHAR        unique, not null
password_hash     VARCHAR        not null
role              ENUM           student | admin    default: student
is_verified       BOOLEAN        default: false
is_banned         BOOLEAN        default: false
created_at        TIMESTAMP
updated_at        TIMESTAMP
```

**RefreshToken**
```
id                UUID           primary key
user_id           UUID           FK → users
token_hash        VARCHAR        unique    stored as SHA-256 hash
device_id         VARCHAR        identifies the device
platform          ENUM           ios | android | web
expires_at        TIMESTAMP
revoked           BOOLEAN        default: false
revoked_at        TIMESTAMP      nullable
created_at        TIMESTAMP
```

**PasswordResetToken**
```
id                UUID           primary key
user_id           UUID           FK → users
token_hash        VARCHAR        unique    stored as SHA-256 hash
expires_at        TIMESTAMP      1 hour from creation
used              BOOLEAN        default: false
created_at        TIMESTAMP
```

### JWT Structure

Access token header:
```json
{ "alg": "RS256", "kid": "key-v1" }
```

Access token payload:
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "student",
  "iat": 1234567890,
  "exp": 1234568790
}
```

### Token Strategy

```
Access token    RS256 JWT       15 minutes    stateless, verified with public key only
Refresh token   random UUID     30 days       stored hashed in DB, rotated on every use
```

On logout: revoke that device's refresh token only.
On logout-all: revoke all refresh tokens for that user.
On refresh: delete old refresh token, issue new one (rotation).
On password reset: revoke all refresh tokens (force re-login everywhere).

### JWKS Endpoint

`GET /.well-known/jwks.json` — public, no auth.
Returns RSA public key in JWK format with `kid` matching the JWT header.
Flutter and web fetch this once, cache it, verify tokens locally without a DB call.
Key rotation: add new key to JWKS, keep old key until all old tokens have expired.

### Password Reset Flow

```
1. POST /auth/forgot-password { email }
2. Generate random token, store hashed with 1hr expiry
3. Send email with link: APP_URL/reset-password?token=xxx
4. POST /auth/reset-password { token, newPassword }
5. Verify token hash + not expired + not used
6. Update password_hash, mark token as used
7. Revoke all refresh tokens for that user
```

### Rate Limiting

```
POST /auth/login            5 requests per 15 minutes per IP
POST /auth/register         10 requests per hour per IP
POST /auth/forgot-password  3 requests per hour per IP
```

### Security Notes

- Refresh token stored as SHA-256 hash, plain token returned to client once only
- flutter_secure_storage on mobile, httpOnly cookie on web
- Never log tokens or passwords
- Return identical error message for wrong email vs wrong password (prevent enumeration)

### Migration for this module

```bash
npm run migration:generate --name=CreateUsers
npm run migration:generate --name=CreateRefreshTokens
npm run migration:generate --name=CreatePasswordResetTokens
npm run migration:run
```

---

## Module 03 — Users and Profiles

### Endpoints

```
GET    /users/me                      my full profile
PATCH  /users/me                      update my profile
POST   /users/me/avatar               upload avatar image
DELETE /users/me/avatar               remove avatar
GET    /users/:id/public              another user's public profile (no sensitive fields)
```

### Entity

**Profile**
```
user_id              UUID           PK + FK → users (one-to-one)
username             VARCHAR        unique, not null
display_name         VARCHAR
avatar_url           VARCHAR        nullable, URL to storage
bio                  TEXT           nullable
native_language      VARCHAR
english_level        ENUM           beginner | intermediate | advanced
learning_goal        ENUM           fluency | business | travel | exam
country              VARCHAR
timezone             VARCHAR
total_practice_mins  INTEGER        default: 0
total_sessions       INTEGER        default: 0
streak_days          INTEGER        default: 0
last_session_at      TIMESTAMP      nullable
last_active_at       TIMESTAMP
created_at           TIMESTAMP
updated_at           TIMESTAMP
```

### Profile Auto-creation

After successful registration, auto-insert a profile row for the new user.
Do this inside the same DB transaction as the user insert.
Profile starts with null/default values. User completes it later.

### Avatar Upload Rules

```
Accepted types    jpeg, png, webp only
Max size          5 MB
Processing        resize to 400x400, convert to webp using sharp
Storage path      avatars/{userId}/{timestamp}.webp
On update         delete old avatar from storage before uploading new one
```

### Profile Completion Gate

Before a user can join matchmaking, check:
- username is set
- english_level is set

Return a specific error code if profile incomplete so Flutter can redirect to profile setup.

### Migration for this module

```bash
npm run migration:generate --name=CreateProfiles
npm run migration:run
```

---

## Module 04 — Matchmaking

### Purpose

Queue students who want to practice. Pair two random students.
No scheduling, no teacher needed. Tap button → get partner instantly.

### Socket.io Events

```
CLIENT → SERVER
  find_partner          { level?: string, topic?: string }
  cancel_search         (no payload)

SERVER → CLIENT
  searching             { estimated_wait_seconds: number }
  match_found           { roomId, partner: { displayName, avatarUrl, level }, iceServers }
  partner_cancelled     (no payload)     partner left queue before WebRTC connected
  error                 { code, message }
```

### Redis Keys

```
match:queue:{level}            LIST   [userId, userId, ...]
                               levels: all | beginner | intermediate | advanced

match:searching:{userId}       STRING "1"
                               TTL: 5 minutes
                               existence means user is actively in queue

match:room:{roomId}:users      SET    [userIdA, userIdB]
                               TTL: 2 hours

match:room:{roomId}:meta       HASH   { createdAt, topic, level, userAId, userBId }
                               TTL: 2 hours
```

### Matching Algorithm

```
1. Socket connects → authenticate via JWT in handshake auth header
2. User emits find_partner
3. Guard checks:
     is_banned = true           → reject with error
     profile not complete       → reject with error
     already in match:searching → reject with error
     already in active room     → reject with error
4. LPOP match:queue:{level}   (atomic Redis operation)
     If someone is waiting:
       create roomId (UUID)
       generate short-lived TURN credentials (HMAC, valid 1hr)
       store room in Redis (TTL 2hr)
       emit match_found to BOTH users with { roomId, partner info, iceServers }
     Else:
       RPUSH userId into match:queue:{level}
       SET match:searching:{userId} with TTL 5min
       emit searching to user
5. On disconnect:
     LREM match:queue:{level} 0 userId
     DEL match:searching:{userId}
     If user was in room: emit peer_left to partner, update call session
```

### TURN Credentials in match_found

Never hardcode static TURN credentials in the app.
Generate HMAC-based temporary credentials server-side, valid 1 hour.
Formula: `username = {timestamp}:{userId}`, `password = HMAC-SHA1(TURN_SECRET, username)`.
Coturn verifies HMAC automatically. No DB lookup on the TURN server.

### Migration for this module

No new DB tables. Uses Redis only.
CallSession table comes in Module 06.

---

## Module 05 — WebRTC Signaling

### Purpose

Relay WebRTC offer, answer, and ICE candidates between two matched peers.
Backend is a pure relay — it never touches the audio stream.

### Socket.io Events

```
CLIENT → SERVER
  join_room             { roomId }
  webrtc_offer          { roomId, sdp }
  webrtc_answer         { roomId, sdp }
  webrtc_ice            { roomId, candidate }
  end_call              { roomId }

SERVER → CLIENT
  peer_joined           { role: "caller" | "receiver" }
  webrtc_offer          { sdp }              forwarded from partner
  webrtc_answer         { sdp }              forwarded from partner
  webrtc_ice            { candidate }        forwarded from partner
  peer_left             { reason }           partner disconnected or ended call
```

### Signaling Flow

```
User A joins room first   → server emits peer_joined { role: "caller" }   to A
User B joins room second  → server emits peer_joined { role: "receiver" } to both

A creates RTCPeerConnection
A creates offer, emits webrtc_offer
Server forwards offer to B
B creates answer, emits webrtc_answer
Server forwards answer to A
Both exchange ICE candidates via webrtc_ice events
P2P audio connection established (media flows directly, not through server)
```

### Validation Rules

- On every event: verify user is a member of the roomId they claim
- Verify JWT on socket connection (handshake), reject unauthenticated sockets
- If one peer disconnects: emit peer_left to the other
- Room cleaned from Redis when both users leave or on TTL expiry

---

## Module 06 — Call Sessions

### Purpose

Track every call: participants, start time, end time, duration.
Allow post-call rating. Update profile stats after call ends.

### Endpoints

```
GET    /sessions                my call history (paginated)
GET    /sessions/:id            single session detail
POST   /sessions/:id/rate       rate partner after call (1-5 stars)
```

### Entities

**CallSession**
```
id                UUID           primary key
room_id           VARCHAR        unique, same roomId from matchmaking
user_a_id         UUID           FK → users
user_b_id         UUID           FK → users
topic             VARCHAR        nullable
level             VARCHAR        nullable
started_at        TIMESTAMP
ended_at          TIMESTAMP      nullable
duration_seconds  INTEGER        nullable
ended_by          ENUM           user_a | user_b | timeout | error   nullable
created_at        TIMESTAMP
```

**SessionRating**
```
id                UUID           primary key
session_id        UUID           FK → call_sessions
rater_id          UUID           FK → users
rated_id          UUID           FK → users
stars             SMALLINT       1 to 5
created_at        TIMESTAMP

UNIQUE (session_id, rater_id)    one rating per user per session
```

### Session Lifecycle

```
match_found event    INSERT call_session (started_at, room_id, userAId, userBId)
end_call event       UPDATE call_session (ended_at, duration_seconds, ended_by)
peer disconnect      same as end_call
After call ends      UPDATE profiles: total_sessions++, total_practice_mins += duration
                     UPDATE streak_days if last_session_at was yesterday
```

### Migration for this module

```bash
npm run migration:generate --name=CreateCallSessions
npm run migration:generate --name=CreateSessionRatings
npm run migration:run
```

---

## Module 07 — Reports and Safety

### Endpoints

```
POST   /reports                 submit a report
GET    /reports/mine            my submitted reports

Admin only:
GET    /admin/reports           all reports (filter by status)
PATCH  /admin/reports/:id       update status, add admin note, take action
```

### Entity

**Report**
```
id                UUID           primary key
reporter_id       UUID           FK → users
reported_id       UUID           FK → users
session_id        UUID           FK → call_sessions   nullable
reason            ENUM           harassment | spam | inappropriate | hate_speech | other
description       TEXT           nullable
status            ENUM           pending | reviewed | actioned | dismissed   default: pending
admin_note        TEXT           nullable
actioned_at       TIMESTAMP      nullable
created_at        TIMESTAMP
```

### Rules

- User cannot report themselves
- One report per session per user (UNIQUE on session_id + reporter_id)
- Auto-flag user for admin review when they accumulate 3+ pending reports
- On admin ban: update users.is_banned = true, revoke all refresh tokens
- Banned users: socket connections rejected, login rejected

### Migration for this module

```bash
npm run migration:generate --name=CreateReports
npm run migration:run
```

---

## Module 08 — Payments (Stripe)

### Purpose

Sell courses. Uses Stripe Checkout Session (hosted payment page).
Stripe sends webhook to confirm payment. Backend trusts only the webhook.

### Endpoints

```
POST   /payments/create-checkout-session    create Stripe Checkout Session
GET    /payments/orders                     my order history
GET    /payments/orders/:id                 single order detail

POST   /payments/webhook                    Stripe webhook receiver
                                            test locally:
                                            stripe listen --forward-to localhost:5503/payments/webhook
```

### Stripe Checkout Session Flow

```
1. Flutter calls POST /payments/create-checkout-session { courseId }
2. Backend creates Order in DB with status: pending
3. Backend calls Stripe:
     stripe.checkout.sessions.create({
       payment_method_types: ['card'],
       mode: 'payment',
       line_items: [{ price_data: { currency, product_data, unit_amount }, quantity: 1 }],
       success_url: STRIPE_SUCCESS_URL?session_id={CHECKOUT_SESSION_ID},
       cancel_url: STRIPE_CANCEL_URL,
       metadata: { internalOrderId, userId, courseId }
     })
4. Backend saves Stripe session ID to Order, returns { url } to Flutter
5. Flutter opens url in in-app webview or external browser
6. User completes payment on Stripe hosted page
7. Stripe redirects user to success_url (Flutter handles deep link)
8. Stripe ALSO fires POST /payments/webhook with event: checkout.session.completed
9. Backend verifies webhook signature using stripe-signature header
10. Backend updates Order status to paid
11. Backend unlocks course for user (creates Enrollment)
12. Backend sends push notification to user
```

### Why Webhook Not success_url Redirect

success_url redirect can be faked or intercepted.
Webhook is server-to-server, signed with your webhook secret, unfakeable.
Always unlock course from webhook only, never from success_url redirect.

### Webhook Endpoint Rules

```
Route         POST /payments/webhook
Auth          NO JWT auth — Stripe calls this directly
Body parsing  RAW body (Buffer), not JSON parsed
              This is critical — signature verification needs the raw body
              Add a special Fastify content-type parser for this route only
Signature     stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)
Response      Always return 200 OK immediately
              If you return non-200, Stripe retries for 3 days
Processing    After responding 200, process event asynchronously
```

### Webhook Events to Handle

```
checkout.session.completed      payment successful → mark order paid, unlock course
checkout.session.expired        user abandoned checkout → mark order expired
charge.dispute.created          chargeback → flag order, notify admin
refund.created                  refund processed → update order status
```

### Entity

**Order**
```
id                    UUID           primary key
receipt_id            VARCHAR        unique    internal ID
stripe_session_id     VARCHAR        unique    nullable    Checkout Session ID
stripe_payment_id     VARCHAR        nullable              Charge/PaymentIntent ID
user_id               UUID           FK → users
course_id             UUID           FK → courses   nullable (Phase 2)
amount                INTEGER        in smallest currency unit (paise/cents)
currency              VARCHAR        default: inr
status                ENUM           pending | paid | failed | expired | refunded
provider              VARCHAR        default: stripe
paid_at               TIMESTAMP      nullable
metadata              JSONB          nullable
created_at            TIMESTAMP
updated_at            TIMESTAMP
```

### Idempotency for Webhook

Layer 1 — Redis: `webhook:stripe:{eventId}` TTL 72 hours
Layer 2 — PostgreSQL: check `order.status === 'paid'` before updating

Both layers required. Redis is the fast gate, Postgres is the permanent safety net.

See [Idempotency Strategy](#idempotency-strategy) section for full detail.

### Strategy Pattern

`IPaymentProvider` interface defines: `createCheckoutSession`, `verifyWebhookSignature`, `refund`.
`StripeProvider` implements `IPaymentProvider`.
`RazorpayProvider` is also written, ready for future use.
`PaymentProviderFactory` creates the correct provider based on `PAYMENT_PROVIDER` env var.
`PaymentService` receives `IPaymentProvider` via constructor — knows nothing about Stripe specifically.
To switch providers: change `PAYMENT_PROVIDER=razorpay` in `.env`. Nothing else changes.

### Local Development with Stripe CLI

```bash
# Install Stripe CLI, then:
stripe login
stripe listen --forward-to localhost:5503/payments/webhook

# Stripe CLI prints a webhook signing secret like: whsec_xxxxx
# Copy that into STRIPE_WEBHOOK_SECRET in .env

# Trigger a test event manually:
stripe trigger checkout.session.completed
```

### Migration for this module

```bash
npm run migration:generate --name=CreateOrders
npm run migration:run
```

---

## Module 09 — Notifications

### Endpoints

```
POST   /notifications/device          register or update FCM token
DELETE /notifications/device          unregister FCM token on logout
GET    /notifications                 list my notifications (paginated)
PATCH  /notifications/:id/read        mark one as read
PATCH  /notifications/read-all        mark all as read
```

### Entities

**DeviceToken**
```
id                UUID           primary key
user_id           UUID           FK → users
fcm_token         TEXT           not null
device_id         VARCHAR        not null   same device_id as refresh_tokens
platform          ENUM           ios | android
updated_at        TIMESTAMP

UNIQUE (user_id, device_id)
```

**Notification**
```
id                UUID           primary key
user_id           UUID           FK → users
type              ENUM           match_found | payment_success | system | achievement
title             VARCHAR
body              TEXT
data              JSONB          nullable   deep link payload for Flutter
read              BOOLEAN        default: false
sent_at           TIMESTAMP      nullable
read_at           TIMESTAMP      nullable
created_at        TIMESTAMP
```

### FCM Rules

- Update FCM token on every app launch (tokens rotate on iOS/Android)
- One user can have multiple device tokens (multiple devices)
- On logout: delete token for that device_id only
- On logout-all: delete all tokens for that user
- If FCM returns `messaging/registration-token-not-registered`: delete token from DB

### Migration for this module

```bash
npm run migration:generate --name=CreateDeviceTokens
npm run migration:generate --name=CreateNotifications
npm run migration:run
```

---

## Module 10 — Admin

### Endpoints

```
GET    /admin/stats                       dashboard numbers
GET    /admin/users                       list users (search, filter)
GET    /admin/users/:id                   user detail with sessions + reports
PATCH  /admin/users/:id/ban               ban user (reason required)
PATCH  /admin/users/:id/unban             unban user
GET    /admin/reports                     list reports (filter by status)
PATCH  /admin/reports/:id                 update report + admin note
GET    /admin/orders                      list all orders
POST   /admin/orders/:id/refund           initiate Stripe refund
```

### Role Guard

All `/admin/*` routes require `role === 'admin'` in JWT.
Admin accounts created via seed script or direct DB insert only.
Never expose a public "register as admin" endpoint.

---

## Module 11 — LMS Phase 2

### Endpoints

```
Courses:
  POST   /courses
  GET    /courses                    public listing
  GET    /courses/:id
  PATCH  /courses/:id                admin only
  DELETE /courses/:id                admin only

Lessons:
  POST   /courses/:id/lessons
  GET    /courses/:id/lessons
  PATCH  /lessons/:id
  DELETE /lessons/:id

Enrollment:
  POST   /courses/:id/enroll         triggers payment flow
  GET    /my/courses

Progress:
  POST   /lessons/:id/complete
  GET    /my/progress/:courseId

Video:
  GET    /lessons/:id/video-url      returns signed URL for HLS playlist
```

### Entities (Phase 2)

**Course**
```
id              UUID
title           VARCHAR
description     TEXT
thumbnail_url   VARCHAR
price           INTEGER        in smallest unit
currency        VARCHAR
level           ENUM           beginner | intermediate | advanced
is_published    BOOLEAN
created_by      UUID           FK → users (admin)
created_at      TIMESTAMP
```

**Lesson**
```
id              UUID
course_id       UUID           FK → courses
title           VARCHAR
description     TEXT
video_url       VARCHAR        URL to HLS master.m3u8 in storage
duration_secs   INTEGER
order_index     INTEGER        lesson ordering within course
is_free         BOOLEAN        preview lesson, no enrollment needed
created_at      TIMESTAMP
```

**Enrollment**
```
id              UUID
user_id         UUID           FK → users
course_id       UUID           FK → courses
order_id        UUID           FK → orders
enrolled_at     TIMESTAMP

UNIQUE (user_id, course_id)
```

**LessonProgress**
```
id              UUID
user_id         UUID           FK → users
lesson_id       UUID           FK → lessons
completed       BOOLEAN
watch_seconds   INTEGER
completed_at    TIMESTAMP      nullable
```

---

## Infrastructure — STUN/TURN Coturn

### What Each Does

```
STUN   Helps client discover its public IP and port (NAT traversal)
       Lightweight, no media passes through server
       Use Google STUN for free or self-host Coturn

TURN   Relay server for when direct P2P fails (strict NAT, corporate firewall)
       All media relays through your server → uses your bandwidth
       Self-hosting means no per-minute cost unlike Twilio TURN
```

### Server Requirements

```
VPS               Any cloud, 1 vCPU 1GB RAM is enough to start
Public IP         Required (TURN must be reachable from internet)
Open ports        3478 UDP+TCP (STUN/TURN)
                  5349 UDP+TCP (TURN over TLS)
                  49152-65535 UDP (relay port range)
Domain            A record pointing to VPS IP
TLS cert          Let's Encrypt via Certbot
```

### Coturn Key Config

```
/etc/turnserver.conf

listening-port=3478
tls-listening-port=5349
realm=turn.yourdomain.com
server-name=turn.yourdomain.com

use-auth-secret                     HMAC-based temporary credentials
static-auth-secret=YOUR_HMAC_SECRET matches TURN_SECRET in .env

min-port=49152
max-port=65535
fingerprint
no-multicast-peers
no-software-attribute
```

### Short-lived TURN Credentials (HMAC)

Never put static TURN username/password in the Flutter app.
Generate server-side, valid 1 hour, included in match_found event payload.

```
username  = {unix_timestamp_1hr_from_now}:{userId}
password  = HMAC-SHA1(TURN_SECRET, username)   base64 encoded
```

Coturn verifies HMAC on every TURN connection — no DB lookup required.

### TLS Setup

```bash
certbot certonly --standalone -d turn.yourdomain.com
# Point turnserver.conf cert/key paths to the generated files
# Add certbot renew to cron
```

---

## Infrastructure — Video and File Storage

### Storage Split

```
Avatars (images)        R2 or MinIO    public CDN URL
Course thumbnails       R2 or MinIO    public CDN URL
Course videos           R2 or MinIO    private, accessed via signed URL only
Lesson PDFs/attachments R2 or MinIO    private, accessed via signed URL only
```

### Recommended: Cloudflare R2

Zero egress cost unlike AWS S3.
S3-compatible API — use AWS SDK with custom endpoint.
Built-in CDN via Cloudflare network.
Good free tier (10GB storage, 1M reads/month free).

### Alternative: MinIO (self-hosted)

Deploy on your own VPS with Docker.
Full data control, nothing leaves your infrastructure.
Same S3-compatible API.

### Course Video Upload Flow

```
1. Admin uploads video from web dashboard
2. Backend streams multipart upload directly to R2 (do not buffer in memory)
3. Store original: videos/courses/{courseId}/{lessonId}/original.mp4
4. Add transcoding job to Redis/Bull queue (background, do not block HTTP)
5. Worker picks up job, runs FFmpeg:
     Output HLS with multiple qualities:
       1080p, 720p, 480p, 360p
     Each quality = .m3u8 playlist + .ts segment files
     Master playlist references all quality levels
6. Upload HLS output to R2: videos/courses/{courseId}/{lessonId}/hls/
7. Save master.m3u8 URL to lessons.video_url
8. Mark lesson as video_ready, notify admin
```

### Video Delivery via Signed URL

Never serve video directly from backend.
When authenticated enrolled user requests GET /lessons/:id/video-url:
- Verify user is enrolled in the course
- Generate R2/S3 presigned URL for the HLS master.m3u8, valid 2-4 hours
- Return signed URL to Flutter
- Flutter's video_player opens the URL directly from R2/CDN

Signed URLs prevent hotlinking and unauthenticated access.

### Storage Path Convention

```
avatars/
  {userId}/{timestamp}.webp

thumbnails/
  courses/{courseId}/{timestamp}.webp

videos/
  courses/{courseId}/{lessonId}/
    original.mp4
    hls/
      master.m3u8
      720p/
        index.m3u8
        000.ts
        001.ts
        ...
      480p/
        ...

attachments/
  courses/{courseId}/{lessonId}/{originalFilename}
```

---

## Dependency Injection Strategy

No DI framework. Pure constructor injection. All wiring in `container.ts`.

### Flow

```
TypeORM Repository → injected into Service via constructor
Service            → injected into Controller via constructor
Controller         → registered to Fastify route handler
Socket.io Gateway  → receives Service via constructor
```

### container.ts responsibility

Only file that calls `new ClassName(dependency)`.
All other classes only declare `constructor(private x: ISomeInterface)`.
To swap an implementation: change one line in container.ts.

### Testability

Pass mock implementations in tests since all deps come through constructor.
No need to mock modules globally, just pass a mock object.

---

## Payment Strategy Pattern

### Interface Contract

`IPaymentProvider` defines three methods:
- `createCheckoutSession(params)` → returns session URL + sessionId
- `verifyWebhookSignature(rawBody, signature)` → returns boolean
- `refund(params)` → returns refundId

### Providers

`StripeProvider` — current, Stripe Checkout Session flow.
`RazorpayProvider` — written and ready, uses order + payment link flow.

### Factory

`PaymentProviderFactory.create(PAYMENT_PROVIDER)` returns the correct provider.
`PAYMENT_PROVIDER` env var controls which provider is active.

### Switching Providers

Change `PAYMENT_PROVIDER=razorpay` in `.env`.
No code changes required anywhere else.

---

## Idempotency Strategy

### Layer 1 — Webhook Event Deduplication

```
Storage    Redis
Key        webhook:stripe:{eventId}
Value      "1"
TTL        72 hours

On each webhook:
  IF key exists → return 200 OK, skip processing
  ELSE → SET key in Redis, then process
```

Why TTL 72 hours: Stripe retries failed webhooks for up to 3 days.

### Layer 2 — Business State

```
Storage    PostgreSQL
Check      order.status === 'paid'  before updating
TTL        None (permanent record)
```

Even if Redis key expires, Postgres prevents double-processing.

### Layer 3 — API Request Idempotency

```
Storage    Redis
Key        idempotency:{Idempotency-Key header value}
Value      cached response JSON
TTL        24 hours

Apply to   POST /payments/create-checkout-session
Client     Flutter sends Idempotency-Key: {uuid} header
           Same key on retry = same response, no duplicate order
```

---

## Security Checklist

### Auth
- [ ] Passwords hashed with bcrypt, 12 rounds minimum
- [ ] Access tokens expire in 15 minutes
- [ ] Refresh tokens rotated on every use
- [ ] Refresh tokens stored as SHA-256 hash in DB
- [ ] Private key never leaves the server, never committed to git
- [ ] Socket.io connections authenticated via JWT in handshake
- [ ] Banned users rejected at socket connect and HTTP login

### API
- [ ] Rate limiting on auth endpoints
- [ ] Input validated with Zod on all endpoints
- [ ] TypeORM parameterised queries (no SQL injection possible)
- [ ] CORS configured to allowed origins only
- [ ] Helmet.js security headers on all responses
- [ ] No stack traces in production error responses
- [ ] `synchronize: false` in TypeORM always

### Payments
- [ ] Webhook signature verified with raw body before processing
- [ ] Webhook route uses raw body parser, not JSON parser
- [ ] Idempotency check before processing any webhook
- [ ] Course unlock only happens after webhook confirmation, never from success_url redirect
- [ ] Webhook endpoint has no JWT auth (Stripe calls it directly)

### Files
- [ ] Avatar upload: type check, size limit 5MB, resize before storing
- [ ] Video upload: admin only
- [ ] Private videos only accessible via signed URL, not public
- [ ] `./keys/private.pem` in .gitignore
- [ ] `.env` in .gitignore

---

*Build one module at a time following the Build Order above.*
*Run migrations after each entity change.*
*Test each module fully before starting the next.*
