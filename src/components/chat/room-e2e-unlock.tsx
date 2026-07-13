"use client";

type RoomE2eUnlockProps = {
  unlocking: boolean;
  error: string | null;
  onUnlock: (passphrase: string) => void;
};

export function RoomE2eUnlock({
  unlocking,
  error,
  onUnlock,
}: RoomE2eUnlockProps) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <form
        className="w-full max-w-sm border border-zinc-800 bg-zinc-950 p-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const input = form.elements.namedItem(
            "passphrase",
          ) as HTMLInputElement;
          onUnlock(input.value);
        }}
      >
        <div className="space-y-1">
          <p className="text-sm font-bold text-blue-500">UNLOCK ROOM</p>
          <p className="text-xs text-zinc-500">
            Enter the room passphrase to decrypt messages. It never leaves this
            browser.
          </p>
        </div>
        <input
          name="passphrase"
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Room passphrase"
          minLength={8}
          maxLength={128}
          className="w-full bg-black border border-zinc-800 focus:border-zinc-700 focus:outline-none text-zinc-100 placeholder:text-zinc-700 py-3 px-4 text-sm"
        />
        {error && (
          <p className="text-red-500 text-xs font-bold" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={unlocking}
          className="w-full bg-blue-600 text-white p-3 text-sm font-bold hover:bg-blue-500 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {unlocking ? "UNLOCKING..." : "UNLOCK"}
        </button>
      </form>
    </div>
  );
}
