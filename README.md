# Private Chat

A private real-time chat app with two modes: **ephemeral** self-destructing rooms and **persistent** group rooms saved to Postgres.

**Live demo:** [secure-safechat.vercel.app](https://secure-safechat.vercel.app/)

Built with **Next.js 16**, **Elysia**, **Upstash Redis**, **Upstash Realtime**, **Prisma**, and **Neon Postgres**.

---

## Features

### Ephemeral Chat
- **Private rooms** — max 2 users per room, token-based access via HTTP-only cookies
- **Real-time messaging** — messages appear instantly via Server-Sent Events (SSE)
- **Self-destruct timer** — rooms expire after 10 minutes; countdown shown in the UI
- **Manual destroy** — either user can wipe the room and all data immediately

### Persistent Rooms
- **Group rooms** — up to 10 users per room, no login required
- **Saved messages** — chat history stored in Postgres via Prisma
- **Custom or auto-generated codes** — alphanumeric room codes (4–16 chars)
- **Paginated history** — load last 50 messages, scroll up for older
- **Soft delete** — any member can delete the room; data retained in DB
- **System messages** — join/delete events shown inline
- **Rate limiting** — max 10 messages per 10 seconds per user

### Shared
- **Anonymous identities** — random usernames stored locally (`anonymous-wolf-xK9f2`)
- **End-to-end typed API** — Elysia + Eden Treaty for type-safe client/server calls

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| API | Elysia (catch-all route handler) |
| Realtime | Upstash Realtime (SSE) |
| Ephemeral storage | Upstash Redis |
| Persistent storage | Neon Postgres + Prisma ORM |
| Client state | TanStack React Query |
| Styling | Tailwind CSS v4 |
| Language | TypeScript |

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (or Node.js 20+)
- An [Upstash Redis](https://upstash.com) database (free tier works)
- A [Neon Postgres](https://neon.tech) database (via Vercel integration recommended)

### 1. Clone and install

```bash
git clone https://github.com/pandey-prince/realtime_chat.git
cd realtime_chat
bun install
```

### 2. Environment variables

```bash
cp .env.example .env
```

```env
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here
DATABASE_URL=postgresql://user:password@host/db?sslmode=require
```

### 3. Run database migrations

```bash
bunx prisma migrate deploy
```

### 4. Start dev server

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000):
- **Ephemeral**: create a room from the left card
- **Persistent**: use the right card → create or join a room by code

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── [[...slugs]]/     # Elysia API (ephemeral + persistent)
│   │   ├── persistent/       # Persistent room join endpoint
│   │   └── realtime/         # Upstash Realtime SSE endpoint
│   ├── room/[roomId]/        # Ephemeral chat room
│   ├── persistent/           # Persistent lobby
│   ├── persistent/[code]/    # Persistent chat room
│   └── page.tsx              # Home (two-card mode picker)
├── components/chat/          # Shared MessageList, MessageInput
├── hooks/
├── lib/
│   ├── prisma.ts             # Prisma client
│   ├── persistent-room.ts    # Code validation, channel names
│   └── rate-limit.ts         # Message rate limiting (Redis)
└── proxy.ts                  # Route access control
prisma/
├── schema.prisma
└── migrations/
```

---

## API Routes

### Ephemeral
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/room/create` | Create ephemeral room |
| `GET` | `/api/room/ttl?roomId=` | Get remaining TTL |
| `DELETE` | `/api/room?roomId=` | Destroy room |
| `GET` | `/api/messages?roomId=` | Fetch messages |
| `POST` | `/api/messages?roomId=` | Send message |

### Persistent
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/persistent/room/create` | Create persistent room |
| `GET` | `/api/persistent/room?code=` | Room metadata |
| `DELETE` | `/api/persistent/room?code=` | Soft-delete room |
| `GET` | `/api/persistent/messages?code=` | Paginated messages |
| `POST` | `/api/persistent/messages?code=` | Send message |
| `POST` | `/api/persistent/room/join?code=` | Join room + cookie |

---

## Deployment

Deploy to [Vercel](https://vercel.com):

1. Push to GitHub and import in Vercel
2. Add Upstash Redis integration
3. Add Neon Postgres integration (sets `DATABASE_URL`)
4. Run `prisma migrate deploy` in build or via Vercel deploy hook
5. Deploy

---

## License

MIT
