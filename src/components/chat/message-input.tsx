import { useRef } from "react";

type MessageInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  isPending?: boolean;
  placeholder?: string;
};

export function MessageInput({
  value,
  onChange,
  onSend,
  disabled = false,
  isPending = false,
  placeholder = "Type message...",
}: MessageInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (!value.trim() || disabled || isPending) return;
    onSend();
    inputRef.current?.focus();
  };

  return (
    <div className="flex gap-4">
      <div className="flex-1 relative group">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-green-500 animate-pulse">
          {">"}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          disabled={disabled}
          maxLength={1000}
          aria-label="Message"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-black border border-zinc-800 focus:border-zinc-700 focus:outline-none transition-colors text-zinc-100 placeholder:text-zinc-700 py-3 pl-8 pr-4 text-sm disabled:opacity-50"
        />
      </div>

      <button
        onClick={handleSend}
        disabled={!value.trim() || isPending || disabled}
        aria-label="Send message"
        className="bg-zinc-800 text-zinc-400 px-6 text-sm font-bold hover:text-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        SEND
      </button>
    </div>
  );
}
