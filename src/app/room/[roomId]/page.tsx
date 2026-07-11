"use client";

import {
  DestroyAnimationProvider,
  DestroyPanel,
  useDestroyAnimation,
} from "@/components/destroy-animation";
import { MessageInput } from "@/components/chat/message-input";
import { MessageList } from "@/components/chat/message-list";
import { RoomJoinOverlay } from "@/components/chat/room-join-overlay";
import { useUsername } from "@/hooks/use-username";
import { ensureRoomJoin } from "@/hooks/use-room-join";
import { client } from "@/lib/client";
import { useRealtime } from "@/lib/realtime-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "@/lib/realtime";

type MessagesCache = { messages: Message[] };

const messagesKey = (roomId: string) => ["messages", roomId] as const;

const appendMessage = (
  cache: MessagesCache | undefined,
  message: Message,
): MessagesCache => {
  const messages = cache?.messages ?? [];
  if (messages.some((m) => m.id === message.id)) return { messages };
  return { messages: [...messages, message] };
};

function formatTimeRemaining(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const centerBombRect = () => {
  const size = 40;
  return new DOMRect(
    window.innerWidth / 2 - size / 2,
    window.innerHeight / 2 - size / 2,
    size,
    size,
  );
};

function RoomChat() {
  const params = useParams();
  const roomId = params.roomId as string;

  const router = useRouter();
  const queryClient = useQueryClient();
  const { triggerDestroy, phase } = useDestroyAnimation();

  const { username } = useUsername();
  const [input, setInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const destroyBtnRef = useRef<HTMLButtonElement>(null);
  const destroyingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [copyStatus, setCopyStatus] = useState("COPY");
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [joinState, setJoinState] = useState<"loading" | "joined" | "error">(
    "loading",
  );
  const [joinError, setJoinError] = useState<string | null>(null);

  const joined = joinState === "joined";
  const destroying = phase !== "idle";

  const playDestroy = useCallback(
    (origin: DOMRect) => {
      if (destroyingRef.current) return;
      destroyingRef.current = true;
      triggerDestroy(origin);
    },
    [triggerDestroy],
  );

  useEffect(() => {
    if (!username) return;

    let cancelled = false;
    setJoinState("loading");

    ensureRoomJoin(roomId, username).then((result) => {
      if (cancelled) return;

      if (result === "full") {
        router.push("/?error=room-full");
        return;
      }

      if (result === "not-found") {
        router.push("/?error=room-not-found");
        return;
      }

      if (result === "server-error") {
        router.push("/?error=server-error");
        return;
      }

      if (result === "ok") {
        setJoinState("joined");
        return;
      }

      setJoinState("error");
      setJoinError("Could not join room.");
    });

    return () => {
      cancelled = true;
    };
  }, [roomId, router, username]);

  const { data: ttlData } = useQuery({
    queryKey: ["ttl", roomId],
    enabled: joined,
    refetchInterval: 30_000,
    queryFn: async () => {
      const res = await client.room.ttl.get({ query: { roomId } });
      return res.data;
    },
  });

  useEffect(() => {
    if (ttlData?.ttl !== undefined) setTimeRemaining(ttlData.ttl);
  }, [ttlData]);

  useEffect(() => {
    if (!joined) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null) return prev;
        if (prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [joined]);

  useEffect(() => {
    if (timeRemaining === 0 && joined && !destroyingRef.current) {
      playDestroy(centerBombRect());
    }
  }, [timeRemaining, joined, playDestroy]);

  const { data: messages } = useQuery({
    queryKey: messagesKey(roomId),
    enabled: joined,
    queryFn: async () => {
      const res = await client.messages.get({ query: { roomId } });
      if (!res.data || "error" in res.data) {
        throw new Error("Failed to load messages");
      }
      return res.data;
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.messages.length]);

  const { mutate: sendMessage, isPending } = useMutation({
    mutationFn: async ({ text }: { text: string }) => {
      setSendError(null);
      const res = await client.messages.post({ text }, { query: { roomId } });

      if (res.status === 429) {
        const data = res.data as { retryAfter?: number } | null;
        throw new Error(
          `Slow down. Try again in ${data?.retryAfter ?? 10} seconds.`,
        );
      }

      if (res.status !== 200 || !res.data || "error" in res.data) {
        throw new Error("Failed to send message.");
      }

      return res.data;
    },
    onMutate: async ({ text }) => {
      await queryClient.cancelQueries({ queryKey: messagesKey(roomId) });

      const optimistic: Message = {
        id: `pending-${Date.now()}`,
        sender: username,
        text,
        timestamp: Date.now(),
        roomId,
      };

      queryClient.setQueryData<MessagesCache>(messagesKey(roomId), (old) =>
        appendMessage(old, optimistic),
      );

      setInput("");

      return { optimisticId: optimistic.id };
    },
    onSuccess: (serverMessage, _vars, context) => {
      queryClient.setQueryData<MessagesCache>(messagesKey(roomId), (old) => {
        const withoutPending =
          old?.messages.filter((m) => m.id !== context?.optimisticId) ?? [];
        return appendMessage({ messages: withoutPending }, serverMessage);
      });
    },
    onError: (err, _vars, context) => {
      queryClient.setQueryData<MessagesCache>(messagesKey(roomId), (old) => ({
        messages:
          old?.messages.filter((m) => m.id !== context?.optimisticId) ?? [],
      }));
      setSendError(
        err instanceof Error ? err.message : "Failed to send message.",
      );
    },
  });

  useRealtime({
    channels: [roomId],
    events: ["chat.message", "chat.destroy"],
    enabled: joined && !destroying,
    onData: (payload) => {
      if (payload.event === "chat.message") {
        queryClient.setQueryData<MessagesCache>(messagesKey(roomId), (old) =>
          appendMessage(old, payload.data),
        );
      }

      if (payload.event === "chat.destroy") {
        playDestroy(centerBombRect());
      }
    },
  });

  const { mutate: destroyRoom } = useMutation({
    mutationFn: async () => {
      await client.room.delete(null, { query: { roomId } });
    },
  });

  const handleDestroy = () => {
    if (destroying || !destroyBtnRef.current) return;

    const rect = destroyBtnRef.current.getBoundingClientRect();
    playDestroy(rect);
    destroyRoom();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyStatus("COPIED!");
      setTimeout(() => setCopyStatus("COPY"), 2000);
    } catch {
      setCopyStatus("FAILED");
      setTimeout(() => setCopyStatus("COPY"), 2000);
    }
  };

  return (
    <main className="relative flex flex-col h-screen max-h-screen overflow-hidden">
      <RoomJoinOverlay state={joinState} message={joinError ?? undefined} />

      <DestroyPanel
        panel="header"
        className="border-b border-zinc-800 p-4 flex items-center justify-between bg-zinc-900/30"
      >
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-zinc-500 uppercase">Room ID</span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-green-500 truncate">
                {roomId.slice(0, 10) + "..."}
              </span>
              <button
                onClick={copyLink}
                disabled={destroying}
                className="text-[10px] bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
              >
                {copyStatus}
              </button>
            </div>
          </div>

          <div className="h-8 w-px bg-zinc-800" />

          <div className="flex flex-col">
            <span className="text-xs text-zinc-500 uppercase">
              Self-Destruct
            </span>
            <span
              aria-live="polite"
              className={`text-sm font-bold flex items-center gap-2 ${
                timeRemaining !== null && timeRemaining < 60
                  ? "text-red-500"
                  : "text-amber-500"
              }`}
            >
              {timeRemaining !== null
                ? formatTimeRemaining(timeRemaining)
                : "--:--"}
            </span>
          </div>
        </div>

        <button
          ref={destroyBtnRef}
          onClick={handleDestroy}
          disabled={destroying || !joined}
          aria-label="Destroy room"
          className="text-xs bg-zinc-900 border border-zinc-700 hover:border-red-600 hover:bg-red-950/80 px-3 py-1.5 text-zinc-400 hover:text-red-400 font-bold transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed group"
        >
          <span className="group-hover:animate-pulse">💣</span>
          {destroying ? "WIPING..." : "DESTROY"}
        </button>
      </DestroyPanel>

      <DestroyPanel panel="body" className="flex-1 min-h-0">
        <div className="h-full overflow-y-auto p-4 scrollbar-thin">
          <MessageList
            messages={messages?.messages ?? []}
            username={username}
          />
          <div ref={messagesEndRef} />
        </div>
      </DestroyPanel>

      <DestroyPanel
        panel="footer"
        className="p-4 border-t border-zinc-800 bg-zinc-900/30 space-y-2"
      >
        {sendError && (
          <p className="text-red-500 text-xs font-bold" role="alert">
            {sendError}
          </p>
        )}
        <MessageInput
          value={input}
          onChange={setInput}
          onSend={() => sendMessage({ text: input })}
          disabled={destroying || !joined}
          isPending={isPending}
        />
      </DestroyPanel>
    </main>
  );
}

const Page = () => {
  const router = useRouter();

  return (
    <DestroyAnimationProvider
      onComplete={() => router.push("/?destroyed=true")}
    >
      <RoomChat />
    </DestroyAnimationProvider>
  );
};

export default Page;
