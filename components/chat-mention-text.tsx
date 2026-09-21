import { mentionParts } from "@/lib/domain/chat-mentions";
export function ChatMentionText({
  text,
  appearance = "message",
}: {
  text: string;
  appearance?: "message" | "own" | "composer";
}) {
  return mentionParts(text).map((part, index) =>
    part.mention ? (
      <span
        key={index}
        data-chat-mention
        className={
          appearance === "composer"
            ? "rounded-sm bg-primary/10 text-primary"
            : appearance === "own"
              ? "rounded-sm bg-white/15 font-semibold text-cyan-100"
              : "rounded-sm bg-primary/10 font-semibold text-primary"
        }
      >
        {part.text}
      </span>
    ) : (
      part.text
    ),
  );
}
