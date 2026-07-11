import { authorizeRealtimeChannels } from "@/lib/realtime-auth";
import { realtime } from "@/lib/realtime";
import { handle } from "@upstash/realtime";

const realtimeHandler = handle({
  realtime,
  middleware: async ({ request, channels }) =>
    authorizeRealtimeChannels(request, channels),
});

export const GET = (request: Request) => realtimeHandler(request);
