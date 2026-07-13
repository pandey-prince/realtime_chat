"use client";

import { useUsername } from "@/hooks/use-username";
import { client } from "@/lib/client";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const Page = () => (
  <Suspense>
    <Lobby />
  </Suspense>
);

export default Page;

function Lobby() {
  const { username } = useUsername();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [createError, setCreateError] = useState<string | null>(null);

  const wasDestroyed = searchParams.get("destroyed") === "true";
  const error = searchParams.get("error");

  const { mutate: createRoom, isPending: creating } = useMutation({
    mutationFn: async () => {
      setCreateError(null);
      const res = await client.room.create.post();
      if (res.status === 200 && res.data && "roomId" in res.data) {
        router.push(`/room/${res.data.roomId}`);
        return;
      }

      const data = res.data as { error?: string } | null;
      if (data?.error === "rate-limited") {
        throw new Error("Too many rooms created. Please wait and try again.");
      }
      throw new Error("Could not create room. Please try again.");
    },
    onError: (err) => {
      setCreateError(
        err instanceof Error ? err.message : "Could not create room.",
      );
    },
  });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-3xl space-y-8">
        {wasDestroyed && (
          <div
            role="alert"
            className="bg-red-950/50 border border-red-900 p-4 text-center"
          >
            <p className="text-red-500 text-sm font-bold">ROOM DESTROYED</p>
            <p className="text-zinc-500 text-xs mt-1">
              All messages were permanently deleted.
            </p>
          </div>
        )}
        {error === "room-not-found" && (
          <div
            role="alert"
            className="bg-red-950/50 border border-red-900 p-4 text-center"
          >
            <p className="text-red-500 text-sm font-bold">ROOM NOT FOUND</p>
            <p className="text-zinc-500 text-xs mt-1">
              This room may have expired or never existed.
            </p>
          </div>
        )}
        {error === "room-full" && (
          <div
            role="alert"
            className="bg-red-950/50 border border-red-900 p-4 text-center"
          >
            <p className="text-red-500 text-sm font-bold">ROOM FULL</p>
            <p className="text-zinc-500 text-xs mt-1">
              This room is at maximum capacity.
            </p>
          </div>
        )}
        {error === "server-error" && (
          <div
            role="alert"
            className="bg-red-950/50 border border-red-900 p-4 text-center"
          >
            <p className="text-red-500 text-sm font-bold">CONNECTION ERROR</p>
            <p className="text-zinc-500 text-xs mt-1">
              Could not reach the server. Please try again.
            </p>
          </div>
        )}
        {createError && (
          <div
            role="alert"
            className="bg-red-950/50 border border-red-900 p-4 text-center"
          >
            <p className="text-red-500 text-sm font-bold">{createError}</p>
          </div>
        )}

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-green-500">
            {">"}private_chat
          </h1>
          <p className="text-zinc-500 text-sm">Choose your chat mode.</p>
        </div>

        <div className="border border-zinc-800 bg-zinc-900/50 p-4 backdrop-blur-md">
          <label
            htmlFor="identity-display"
            className="flex items-center text-zinc-500 text-sm mb-2"
          >
            Your Identity
          </label>
          <div
            id="identity-display"
            className="bg-zinc-950 border border-zinc-800 p-3 text-sm text-zinc-400 font-mono"
          >
            {username || "Generating identity..."}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-md space-y-4">
            <div>
              <h2 className="text-sm font-bold text-zinc-200">EPHEMERAL CHAT</h2>
              <p className="text-zinc-500 text-xs mt-1">
                2 users · 10 min · self-destructing
              </p>
            </div>
            <button
              onClick={() => createRoom()}
              disabled={creating || !username}
              className="w-full bg-zinc-100 text-black p-3 text-sm font-bold hover:bg-zinc-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? "CREATING..." : "CREATE SECURE ROOM"}
            </button>
          </div>

          <div className="border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-md space-y-4">
            <div>
              <h2 className="text-sm font-bold text-zinc-200">
                PERSISTENT ROOMS
              </h2>
              <p className="text-zinc-500 text-xs mt-1">
                Up to 10 users · passphrase E2E · join by code
              </p>
            </div>
            <Link
              href="/persistent"
              className="block w-full text-center bg-blue-600 text-white p-3 text-sm font-bold hover:bg-blue-500 transition-colors"
            >
              GO TO ROOMS →
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
