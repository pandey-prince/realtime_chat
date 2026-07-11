"use client";

import { useUsername } from "@/hooks/use-username";
import { client } from "@/lib/client";
import { normalizeRoomCode } from "@/lib/persistent-room";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const Page = () => (
  <Suspense>
    <PersistentLobby />
  </Suspense>
);

export default Page;

function PersistentLobby() {
  const { username } = useUsername();
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const deleted = searchParams.get("deleted") === "true";

  const [roomName, setRoomName] = useState("");
  const [createCode, setCreateCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const { mutate: createRoom, isPending: creating } = useMutation({
    mutationFn: async () => {
      setFormError(null);
      const res = await client.persistent.room.create.post({
        name: roomName,
        code: createCode.trim() || undefined,
      });

      if (res.status === 200 && res.data && "code" in res.data) {
        router.push(`/persistent/${res.data.code}`);
        return;
      }

      const err = res.data as { error?: string } | null;
      if (err?.error === "rate-limited")
        setFormError("Too many requests. Please wait and try again.");
      else if (err?.error === "invalid-code") setFormError("Invalid room code. Use 4–16 alphanumeric characters.");
      else if (err?.error === "code-taken") setFormError("That room code is already taken.");
      else if (err?.error === "invalid-name") setFormError("Please enter a valid room name.");
      else setFormError("Could not create room. Try again.");
    },
  });

  const handleJoin = () => {
    setFormError(null);
    const code = normalizeRoomCode(joinCode);
    if (!code) {
      setFormError("Invalid room code. Use 4–16 alphanumeric characters.");
      return;
    }
    router.push(`/persistent/${code}`);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <Link
            href="/"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            ← Back to home
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-blue-500">
            {">"}persistent_rooms
          </h1>
          <p className="text-zinc-500 text-sm">
            Create or join a room. Messages are saved permanently.
          </p>
        </div>

        {deleted && (
          <div className="bg-amber-950/50 border border-amber-900 p-4 text-center">
            <p className="text-amber-500 text-sm font-bold">ROOM DELETED</p>
            <p className="text-zinc-500 text-xs mt-1">
              This room was removed by a member.
            </p>
          </div>
        )}

        {error === "room-not-found" && (
          <div className="bg-red-950/50 border border-red-900 p-4 text-center">
            <p className="text-red-500 text-sm font-bold">ROOM NOT FOUND</p>
            <p className="text-zinc-500 text-xs mt-1">
              This room does not exist or was deleted.
            </p>
          </div>
        )}
        {error === "room-full" && (
          <div className="bg-red-950/50 border border-red-900 p-4 text-center">
            <p className="text-red-500 text-sm font-bold">ROOM FULL</p>
            <p className="text-zinc-500 text-xs mt-1">
              This room already has 10 members.
            </p>
          </div>
        )}
        {error === "room-deleted" && (
          <div className="bg-red-950/50 border border-red-900 p-4 text-center">
            <p className="text-red-500 text-sm font-bold">ROOM DELETED</p>
            <p className="text-zinc-500 text-xs mt-1">
              This room was soft-deleted and cannot be joined.
            </p>
          </div>
        )}
        {error === "invalid-code" && (
          <div
            role="alert"
            className="bg-red-950/50 border border-red-900 p-4 text-center"
          >
            <p className="text-red-500 text-sm font-bold">INVALID CODE</p>
            <p className="text-zinc-500 text-xs mt-1">
              Room codes must be 4–16 alphanumeric characters.
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

        {formError && (
          <div
            role="alert"
            className="bg-red-950/50 border border-red-900 p-4 text-center"
          >
            <p className="text-red-500 text-sm font-bold">{formError}</p>
          </div>
        )}

        <div className="border border-zinc-800 bg-zinc-900/50 p-4 backdrop-blur-md">
          <label className="text-zinc-500 text-sm">Your Identity</label>
          <div className="mt-2 bg-zinc-950 border border-zinc-800 p-3 text-sm text-zinc-400 font-mono">
            {username}
          </div>
        </div>

        <div className="border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-md space-y-4">
          <h2 className="text-sm font-bold text-zinc-200">CREATE ROOM</h2>
          <div className="space-y-3">
            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Room name"
              maxLength={100}
              className="w-full bg-black border border-zinc-800 focus:border-zinc-700 focus:outline-none text-zinc-100 placeholder:text-zinc-700 py-3 px-4 text-sm"
            />
            <input
              type="text"
              value={createCode}
              onChange={(e) => setCreateCode(e.target.value.toUpperCase())}
              placeholder="Room code (optional, auto-generated if blank)"
              maxLength={16}
              className="w-full bg-black border border-zinc-800 focus:border-zinc-700 focus:outline-none text-zinc-100 placeholder:text-zinc-700 py-3 px-4 text-sm font-mono uppercase"
            />
            <button
              onClick={() => createRoom()}
              disabled={!roomName.trim() || creating}
              className="w-full bg-blue-600 text-white p-3 text-sm font-bold hover:bg-blue-500 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {creating ? "CREATING..." : "CREATE ROOM"}
            </button>
          </div>
        </div>

        <div className="border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-md space-y-4">
          <h2 className="text-sm font-bold text-zinc-200">JOIN ROOM</h2>
          <div className="space-y-3">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoin();
              }}
              placeholder="Enter room code"
              maxLength={16}
              className="w-full bg-black border border-zinc-800 focus:border-zinc-700 focus:outline-none text-zinc-100 placeholder:text-zinc-700 py-3 px-4 text-sm font-mono uppercase"
            />
            <button
              onClick={handleJoin}
              disabled={!joinCode.trim()}
              className="w-full bg-zinc-100 text-black p-3 text-sm font-bold hover:bg-zinc-50 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              JOIN ROOM
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
