type JoinResult =
  | "ok"
  | "full"
  | "not-found"
  | "deleted"
  | "invalid"
  | "server-error";

const joinFlights = new Map<string, Promise<JoinResult>>();

export async function ensurePersistentRoomJoin(
  code: string,
  username: string,
): Promise<JoinResult> {
  const inFlight = joinFlights.get(code);
  if (inFlight) return inFlight;

  const flight = (async () => {
    try {
      const res = await fetch(
        `/api/persistent/room/join?code=${encodeURIComponent(code)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        },
      );

      if (res.status === 200) return "ok";
      if (res.status === 403) return "full";
      if (res.status === 404) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (data?.error === "room-deleted") return "deleted";
        return "not-found";
      }
      if (res.status === 400) return "invalid";
      return "server-error";
    } catch {
      return "server-error";
    } finally {
      joinFlights.delete(code);
    }
  })();

  joinFlights.set(code, flight);
  return flight;
}
