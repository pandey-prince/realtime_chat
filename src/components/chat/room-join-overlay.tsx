type RoomJoinState = "loading" | "joined" | "error";

export function RoomJoinOverlay({
  state,
  message,
}: {
  state: RoomJoinState;
  message?: string;
}) {
  if (state === "joined") return null;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="text-center space-y-2 px-6" role="status" aria-live="polite">
        {state === "loading" && (
          <>
            <p className="text-green-500 text-sm font-bold font-mono">
              JOINING ROOM...
            </p>
            <p className="text-zinc-500 text-xs">Securing your connection</p>
          </>
        )}
        {state === "error" && (
          <p className="text-red-500 text-sm font-bold" role="alert">
            {message ?? "Could not join room"}
          </p>
        )}
      </div>
    </div>
  );
}
