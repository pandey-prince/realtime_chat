"use client";

import { MessageInput } from "@/components/chat/message-input";
import { MessageList } from "@/components/chat/message-list";
import { RoomE2eUnlock } from "@/components/chat/room-e2e-unlock";
import { RoomJoinOverlay } from "@/components/chat/room-join-overlay";
import { ensurePersistentRoomJoin } from "@/hooks/use-persistent-room-join";
import { useRoomE2eKey } from "@/hooks/use-room-e2e-key";
import { useUsername } from "@/hooks/use-username";
import { client } from "@/lib/client";
import { decryptText, encryptText, validatePassphrase } from "@/lib/e2e";
import { persistentRealtimeChannel } from "@/lib/persistent-room";
import type { Message } from "@/lib/realtime";
import { useRealtime } from "@/lib/realtime-client";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type MessagesPage = {
  messages: Message[];
  nextCursor?: string;
  hasMore: boolean;
};

const messagesKey = (code: string) => ["persistent-messages", code] as const;
const roomKey = (code: string) => ["persistent-room", code] as const;

const appendMessage = (messages: Message[], message: Message): Message[] => {
  if (messages.some((m) => m.id === message.id)) return messages;
  return [...messages, message];
};

function isMessagePage(data: unknown): data is MessagesPage {
  return (
    typeof data === "object" &&
    data !== null &&
    "messages" in data &&
    Array.isArray((data as MessagesPage).messages)
  );
}

function isSystemMessage(message: Message) {
  return Boolean(message.isSystem) || message.sender === "__system__";
}

function PersistentRoomChat() {
  const params = useParams();
  const code = (params.code as string).toUpperCase();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { username } = useUsername();
  const {
    key,
    unlocked,
    unlock,
    trySessionUnlock,
    unlockError,
    unlocking,
  } = useRoomE2eKey(code);

  const [input, setInput] = useState("");
  const [copyStatus, setCopyStatus] = useState("COPY");
  const [sendError, setSendError] = useState<string | null>(null);
  const [joinState, setJoinState] = useState<"loading" | "joined" | "error">(
    "loading",
  );
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [plaintextById, setPlaintextById] = useState<Map<string, string>>(
    () => new Map(),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingOlderRef = useRef(false);
  const sessionTriedRef = useRef(false);
  const decryptedIdsRef = useRef(new Set<string>());

  const joined = joinState === "joined";

  useEffect(() => {
    if (!username) return;

    let cancelled = false;
    setJoinState("loading");

    ensurePersistentRoomJoin(code, username).then((result) => {
      if (cancelled) return;

      if (result === "full") {
        router.push("/persistent?error=room-full");
        return;
      }
      if (result === "deleted") {
        router.push("/persistent?error=room-deleted");
        return;
      }
      if (result === "not-found") {
        router.push("/persistent?error=room-not-found");
        return;
      }
      if (result === "invalid") {
        router.push("/persistent?error=invalid-code");
        return;
      }
      if (result === "server-error") {
        router.push("/persistent?error=server-error");
        return;
      }
      if (result === "ok") {
        setJoinState("joined");
        return;
      }

      setJoinState("error");
    });

    return () => {
      cancelled = true;
    };
  }, [code, router, username]);

  const { data: roomMeta } = useQuery({
    queryKey: roomKey(code),
    enabled: joined,
    queryFn: async () => {
      const res = await client.persistent.room.get({ query: { code } });
      return res.data;
    },
  });

  const e2eSalt =
    roomMeta && "e2eSalt" in roomMeta && typeof roomMeta.e2eSalt === "string"
      ? roomMeta.e2eSalt
      : null;
  const e2eVerifier =
    roomMeta &&
    "e2eVerifier" in roomMeta &&
    typeof roomMeta.e2eVerifier === "string"
      ? roomMeta.e2eVerifier
      : null;

  const needsE2e = Boolean(e2eSalt && e2eVerifier);
  const isLegacyPlaintext = Boolean(roomMeta && !needsE2e);
  const canUseChat = joined && (unlocked || isLegacyPlaintext);

  useEffect(() => {
    if (
      roomMeta &&
      "memberCount" in roomMeta &&
      typeof roomMeta.memberCount === "number"
    ) {
      setMemberCount(roomMeta.memberCount);
    }
  }, [roomMeta]);

  useEffect(() => {
    sessionTriedRef.current = false;
    decryptedIdsRef.current = new Set();
    setPlaintextById(new Map());
  }, [code]);

  useEffect(() => {
    if (!needsE2e || unlocked || !e2eSalt || !e2eVerifier || sessionTriedRef.current) {
      return;
    }
    sessionTriedRef.current = true;
    void trySessionUnlock(e2eSalt, e2eVerifier);
  }, [needsE2e, unlocked, e2eSalt, e2eVerifier, trySessionUnlock]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: messagesKey(code),
    enabled: canUseChat,
    refetchOnWindowFocus: false,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const res = await client.persistent.messages.get({
        query: {
          code,
          cursor: pageParam,
        },
      });

      if (!isMessagePage(res.data)) {
        throw new Error("Failed to load messages");
      }

      return res.data;
    },
    getNextPageParam: (lastPage) =>
      lastPage?.hasMore ? lastPage.nextCursor : undefined,
  });

  const allMessages =
    data?.pages
      .slice()
      .reverse()
      .flatMap((page) => page?.messages ?? []) ?? [];

  useEffect(() => {
    if (!canUseChat) return;

    let cancelled = false;

    const decryptAll = async () => {
      const updates = new Map<string, string>();

      for (const message of allMessages) {
        if (decryptedIdsRef.current.has(message.id)) continue;

        if (isSystemMessage(message) || isLegacyPlaintext) {
          updates.set(message.id, message.text);
          continue;
        }

        if (!key) continue;

        try {
          updates.set(message.id, await decryptText(key, message.text));
        } catch {
          updates.set(message.id, "Unable to decrypt");
        }
      }

      if (cancelled || updates.size === 0) return;

      for (const id of updates.keys()) {
        decryptedIdsRef.current.add(id);
      }

      setPlaintextById((prev) => {
        const next = new Map(prev);
        for (const [id, text] of updates) {
          next.set(id, text);
        }
        return next;
      });
    };

    void decryptAll();

    return () => {
      cancelled = true;
    };
  }, [allMessages, canUseChat, isLegacyPlaintext, key]);

  const displayMessages = useMemo(
    () =>
      allMessages.map((message) => ({
        ...message,
        text: plaintextById.get(message.id) ?? "…",
      })),
    [allMessages, plaintextById],
  );

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingOlderRef.current || !hasNextPage || isFetchingNextPage) {
      return;
    }

    if (el.scrollTop < 80) {
      loadingOlderRef.current = true;
      const prevHeight = el.scrollHeight;

      fetchNextPage()
        .then(() => {
          requestAnimationFrame(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTop =
                scrollRef.current.scrollHeight - prevHeight;
            }
          });
        })
        .finally(() => {
          loadingOlderRef.current = false;
        });
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !canUseChat) return;

    const isNearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120;

    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [displayMessages.length, canUseChat]);

  const { mutate: sendMessage, isPending } = useMutation({
    mutationFn: async ({ text }: { text: string }) => {
      setSendError(null);

      let wireText = text;
      if (needsE2e) {
        if (!key) throw new Error("Room is locked.");
        wireText = await encryptText(key, text);
      }

      const res = await client.persistent.messages.post(
        { text: wireText },
        { query: { code } },
      );

      if (res.status === 429) {
        const data = res.data as { retryAfter?: number } | null;
        throw new Error(
          `Slow down. Try again in ${data?.retryAfter ?? 10} seconds.`,
        );
      }

      if (res.status !== 200 || !res.data || "error" in res.data) {
        throw new Error("Failed to send message.");
      }

      return { serverMessage: res.data as Message, plaintext: text };
    },
    onMutate: async ({ text }) => {
      await queryClient.cancelQueries({ queryKey: messagesKey(code) });

      const optimisticId = `pending-${Date.now()}`;
      const optimistic: Message = {
        id: optimisticId,
        sender: username,
        text: needsE2e ? "…" : text,
        timestamp: Date.now(),
        roomId: code,
      };

      setPlaintextById((prev) => {
        const next = new Map(prev);
        next.set(optimisticId, text);
        return next;
      });
      decryptedIdsRef.current.add(optimisticId);

      queryClient.setQueryData(messagesKey(code), (old: typeof data) => {
        if (!old) {
          return {
            pages: [{ messages: [optimistic], hasMore: false }],
            pageParams: [undefined],
          };
        }
        const pages = [...old.pages];
        const last = pages[pages.length - 1];
        if (last) {
          pages[pages.length - 1] = {
            ...last,
            messages: appendMessage(last.messages ?? [], optimistic),
          };
        }
        return { ...old, pages };
      });

      setInput("");
      return { optimisticId };
    },
    onSuccess: ({ serverMessage, plaintext }, _vars, context) => {
      setPlaintextById((prev) => {
        const next = new Map(prev);
        if (context?.optimisticId) {
          next.delete(context.optimisticId);
          decryptedIdsRef.current.delete(context.optimisticId);
        }
        next.set(serverMessage.id, plaintext);
        decryptedIdsRef.current.add(serverMessage.id);
        return next;
      });

      queryClient.setQueryData(messagesKey(code), (old: typeof data) => {
        if (!old) return old;
        const pages = old.pages.map((page, i) => {
          if (i !== old.pages.length - 1) return page;
          const withoutPending =
            page?.messages?.filter((m) => m.id !== context?.optimisticId) ?? [];
          return {
            ...page,
            messages: appendMessage(withoutPending, serverMessage),
          };
        });
        return { ...old, pages };
      });
    },
    onError: (err, _vars, context) => {
      if (context?.optimisticId) {
        setPlaintextById((prev) => {
          const next = new Map(prev);
          next.delete(context.optimisticId);
          return next;
        });
        decryptedIdsRef.current.delete(context.optimisticId);
      }
      queryClient.setQueryData(messagesKey(code), (old: typeof data) => {
        if (!old) return old;
        const pages = old.pages.map((page, i) => {
          if (i !== old.pages.length - 1) return page;
          return {
            ...page,
            messages:
              page?.messages?.filter((m) => m.id !== context?.optimisticId) ??
              [],
          };
        });
        return { ...old, pages };
      });
      setSendError(
        err instanceof Error ? err.message : "Failed to send message.",
      );
    },
  });

  useRealtime({
    channels: [persistentRealtimeChannel(code)],
    events: ["persistent.message", "persistent.destroy", "persistent.memberJoined"],
    enabled: canUseChat,
    onData: (payload) => {
      if (payload.event === "persistent.message") {
        queryClient.setQueryData(messagesKey(code), (old: typeof data) => {
          if (!old) {
            return {
              pages: [{ messages: [payload.data], hasMore: false }],
              pageParams: [undefined],
            };
          }
          const pages = [...old.pages];
          const last = pages[pages.length - 1];
          if (last) {
            pages[pages.length - 1] = {
              ...last,
              messages: appendMessage(last.messages ?? [], payload.data),
            };
          }
          return { ...old, pages };
        });
      }

      if (payload.event === "persistent.memberJoined") {
        setMemberCount(payload.data.memberCount);
      }

      if (payload.event === "persistent.destroy") {
        router.push("/persistent?deleted=true");
      }
    },
  });

  const { mutate: deleteRoom, isPending: deleting } = useMutation({
    mutationFn: async () => {
      const res = await client.persistent.room.delete(null, { query: { code } });
      if (res.status !== 200) {
        throw new Error("Failed to delete room.");
      }
    },
    onSuccess: () => {
      router.push("/persistent?deleted=true");
    },
  });

  const handleDelete = () => {
    if (
      !window.confirm(
        "Delete this room for everyone? Messages will be soft-deleted.",
      )
    ) {
      return;
    }
    deleteRoom();
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

  const handleUnlock = async (rawPassphrase: string) => {
    if (!e2eSalt || !e2eVerifier) return;
    const passphrase = validatePassphrase(rawPassphrase);
    if (!passphrase) {
      return;
    }
    await unlock(passphrase, e2eSalt, e2eVerifier);
  };

  const roomName =
    roomMeta && "name" in roomMeta ? roomMeta.name : "Loading...";

  const showUnlockGate = joined && needsE2e && !unlocked;

  return (
    <main className="relative flex flex-col h-screen max-h-screen overflow-hidden">
      <RoomJoinOverlay state={joinState} />
      {showUnlockGate && (
        <RoomE2eUnlock
          unlocking={unlocking}
          error={unlockError}
          onUnlock={handleUnlock}
        />
      )}

      <header className="border-b border-zinc-800 p-4 flex items-center justify-between bg-zinc-900/30">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex flex-col min-w-0">
            <span className="text-xs text-zinc-500 uppercase">Room</span>
            <span className="font-bold text-blue-500 truncate">{roomName}</span>
          </div>

          <div className="h-8 w-px bg-zinc-800 shrink-0" />

          <div className="flex flex-col">
            <span className="text-xs text-zinc-500 uppercase">Code</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-zinc-300">{code}</span>
              <button
                onClick={copyLink}
                className="text-[10px] bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {copyStatus}
              </button>
            </div>
          </div>

          <div className="h-8 w-px bg-zinc-800 shrink-0" />

          <div className="flex flex-col">
            <span className="text-xs text-zinc-500 uppercase">Members</span>
            <span className="text-sm font-bold text-zinc-300">
              {memberCount ?? "—"}/10
            </span>
          </div>

          {needsE2e && unlocked && (
            <>
              <div className="h-8 w-px bg-zinc-800 shrink-0" />
              <span className="text-[10px] uppercase tracking-wide text-emerald-500 font-bold">
                E2E
              </span>
            </>
          )}
          {isLegacyPlaintext && (
            <>
              <div className="h-8 w-px bg-zinc-800 shrink-0" />
              <span className="text-[10px] uppercase tracking-wide text-amber-500 font-bold">
                Legacy
              </span>
            </>
          )}
        </div>

        <button
          onClick={handleDelete}
          disabled={deleting || !canUseChat}
          aria-label="Delete room"
          className="text-xs bg-zinc-900 border border-zinc-700 hover:border-red-600 hover:bg-red-950/80 px-3 py-1.5 text-zinc-400 hover:text-red-400 font-bold transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed shrink-0"
        >
          {deleting ? "DELETING..." : "DELETE ROOM"}
        </button>
      </header>

      {isLegacyPlaintext && (
        <div
          role="status"
          className="border-b border-amber-900/50 bg-amber-950/40 px-4 py-2 text-center text-amber-400 text-xs"
        >
          This room was created before encryption. Messages are stored in
          plaintext.
        </div>
      )}

      {needsE2e && unlocked && (
        <div className="border-b border-zinc-800 bg-zinc-950/60 px-4 py-1.5 text-center text-[11px] text-zinc-500">
          Share the passphrase separately from the invite link — anyone with it
          can read this room.
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto p-4 scrollbar-thin"
      >
        {isFetchingNextPage && (
          <div className="text-center text-zinc-600 text-xs font-mono py-2">
            Loading older messages...
          </div>
        )}
        {canUseChat ? (
          <MessageList messages={displayMessages} username={username} />
        ) : (
          <div className="text-center text-zinc-600 text-xs font-mono py-8">
            Unlock the room to view messages.
          </div>
        )}
      </div>

      <footer className="p-4 border-t border-zinc-800 bg-zinc-900/30 space-y-2">
        {sendError && (
          <p className="text-red-500 text-xs font-bold" role="alert">
            {sendError}
          </p>
        )}
        <MessageInput
          value={input}
          onChange={setInput}
          onSend={() => sendMessage({ text: input })}
          disabled={!canUseChat}
          isPending={isPending}
        />
      </footer>
    </main>
  );
}

export default PersistentRoomChat;
