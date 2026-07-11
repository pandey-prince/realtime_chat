import type { ReactNode } from "react";
import type { Message } from "@/lib/realtime";
import { format } from "date-fns";

type MessageListProps = {
  messages: Message[];
  username: string;
  emptyText?: string;
  topSlot?: ReactNode;
};

export function MessageList({
  messages,
  username,
  emptyText = "No messages yet, start the conversation.",
  topSlot,
}: MessageListProps) {
  return (
    <div role="log" aria-live="polite" aria-relevant="additions" className="space-y-4">
      {topSlot}
      {messages.length === 0 && (
        <div className="flex items-center justify-center h-full min-h-[8rem]">
          <p className="text-zinc-600 text-sm font-mono">{emptyText}</p>
        </div>
      )}

      {messages.map((msg) => {
        if (msg.isSystem || msg.sender === "__system__") {
          return (
            <div key={msg.id} className="flex justify-center">
              <p className="text-[11px] text-zinc-500 font-mono bg-zinc-900/60 border border-zinc-800 px-3 py-1">
                {msg.text}
              </p>
            </div>
          );
        }

        return (
          <div key={msg.id} className="flex flex-col items-start">
            <div className="max-w-[80%] group">
              <div className="flex items-baseline gap-3 mb-1">
                <span
                  className={`text-xs font-bold ${
                    msg.sender === username ? "text-green-500" : "text-blue-500"
                  }`}
                >
                  {msg.sender === username ? "YOU" : msg.sender}
                </span>

                <span className="text-[10px] text-zinc-600">
                  {format(msg.timestamp, "HH:mm")}
                </span>
              </div>

              <p className="text-sm text-zinc-300 leading-relaxed break-all">
                {msg.text}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
