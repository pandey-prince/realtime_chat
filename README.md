# Private Chat

A private, self-destructing real-time chat app. Create a room, share the link with one other person, and chat with live updates. When the timer runs out—or someone hits destroy—the room and all messages are gone.

Built with **Next.js 16**, **Elysia**, **Upstash Redis**, and **Upstash Realtime**.

---

## Features

- **Private rooms** — max 2 users per room, token-based access via HTTP-only cookies
- **Real-time messaging** — messages appear instantly via Server-Sent Events (SSE)
- **Self-destruct timer** — rooms expire after 10 minutes; countdown shown in the UI
- **Manual destroy** — either user can wipe the room and all data immediately
- **Anonymous identities** — random usernames stored locally (`anonymous-wolf-xK9f2`)
- **End-to-end typed API** — Elysia + Eden Treaty for type-safe client/server calls

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| API | Elysia (catch-all route handler) |
| Realtime | Upstash Realtime (SSE) |
| Database | Upstash Redis |
| Client state | TanStack React Query |
| Styling | Tailwind CSS v4 |
| Language | TypeScript |

---

## How It Works

```
Lobby                    Room Page                    Backend
  │                          │                          │
  ├─ Create room ──────────► │                          ├─ POST /api/room/create
  │                          │                          │     → store meta in Redis
  │                          │                          │
  ├─ Navigate /room/:id ───► │                          │
  │     (proxy.ts)           │                          ├─ Issue x-auth-token cookie
  │                          │                          │     → add token to room
  │                          │                          │
  │                          ├─ Load messages ────────► ├─ GET /api/messages
  │                          ├─ Subscribe realtime ───► ├─ GET /api/realtime (SSE)
  │                          │                          │
  │                          ├─ Send message ─────────► ├─ POST /api/messages
  │                          │                          │     → emit chat.message
  │                          ◄── live update ──────────┤
  │                          │                          │
  │                          ├─ Destroy / TTL ────────► ├─ DELETE /api/room
  │◄── redirect home ────────┤                          │     → emit chat.destroy
```

1. User creates a room from the lobby.
2. `proxy.ts` runs on `/room/:id` — validates the room, assigns an auth token cookie, and enforces the 2-user limit.
3. Protected API routes check the cookie token against Redis before serving data.
4. Messages are stored in Redis and broadcast through Upstash Realtime channels.
5. When the TTL hits zero or someone destroys the room, all Redis keys are deleted and clients are redirected home.

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (or Node.js 20+)
- An [Upstash Redis](https://upstash.com) database (free tier works)

### 1. Clone the repo

```bash
git clone https://github.com/pandey-prince/realtime_chat.git
cd realtime_chat
```

### 2. Install dependencies

```bash
bun install
```

### 3. Set up environment variables

Copy the example file and fill in your Upstash credentials:

```bash
cp .env.example .env
```

```env
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here
```

You can find these in the Upstash console under your Redis database → **REST API**.

### 4. Run the dev server

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000), create a room, and open the same link in another tab or browser to test chat.

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── [[...slugs]]/     # Elysia API (rooms, messages, auth)
│   │   └── realtime/         # Upstash Realtime SSE endpoint
│   ├── room/[roomId]/        # Chat room page
│   ├── layout.tsx
│   └── page.tsx              # Lobby
├── components/
│   └── providers.tsx         # React Query + Realtime providers
├── hooks/
│   └── use-username.ts       # Anonymous username (localStorage)
├── lib/
│   ├── client.ts             # Eden Treaty API client
│   ├── realtime.ts           # Upstash Realtime schema + instance
│   ├── realtime-client.ts    # Typed useRealtime hook
│   └── redis.ts              # Upstash Redis client
└── proxy.ts                  # Room access control (Next.js 16 proxy)
```

---

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/room/create` | Create a new room |
| `GET` | `/api/room/ttl?roomId=` | Get remaining TTL (auth required) |
| `DELETE` | `/api/room?roomId=` | Destroy room and all data |
| `GET` | `/api/messages?roomId=` | Fetch message history |
| `POST` | `/api/messages?roomId=` | Send a message |
| `GET` | `/api/realtime` | SSE stream for live events |

---

## Scripts

```bash
bun dev      # Start development server
bun build    # Production build
bun start    # Start production server
bun lint     # Run ESLint
```

---

## Deployment

Deploy to [Vercel](https://vercel.com) or any platform that supports Next.js 16.

1. Push to GitHub
2. Import the repo in Vercel
3. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` as environment variables
4. Deploy

---

## License

MIT
