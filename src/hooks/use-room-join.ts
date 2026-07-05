type JoinResult = "ok" | "full" | "not-found" | "error";

const joinFlights = new Map<string, Promise<JoinResult>>();

export async function ensureRoomJoin(roomId: string): Promise<JoinResult> {
  const inFlight = joinFlights.get(roomId);
  if (inFlight) return inFlight;

  const flight = (async () => {
    try {
      const res = await fetch(`/api/room/join?roomId=${encodeURIComponent(roomId)}`, {
        method: "POST",
        credentials: "include",
      });

      if (res.status === 200) return "ok";
      if (res.status === 403) return "full";
      if (res.status === 404) return "not-found";
      return "error";
    } catch {
      return "error";
    } finally {
      joinFlights.delete(roomId);
    }
  })();

  joinFlights.set(roomId, flight);
  return flight;
}
