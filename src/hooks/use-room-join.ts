type JoinResult = "ok" | "full" | "not-found" | "server-error";

const joinFlights = new Map<string, Promise<JoinResult>>();

export async function ensureRoomJoin(
  roomId: string,
  username: string,
): Promise<JoinResult> {
  const inFlight = joinFlights.get(roomId);
  if (inFlight) return inFlight;

  const flight = (async () => {
    try {
      const res = await fetch(
        `/api/room/join?roomId=${encodeURIComponent(roomId)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        },
      );

      if (res.status === 200) return "ok";
      if (res.status === 403) return "full";
      if (res.status === 404) return "not-found";
      return "server-error";
    } catch {
      return "server-error";
    } finally {
      joinFlights.delete(roomId);
    }
  })();

  joinFlights.set(roomId, flight);
  return flight;
}
