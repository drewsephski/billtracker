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
            ? "rounded-sm bg-blue-500/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300"
            : appearance === "own"
              ? "rounded-sm bg-white/15 font-semibold text-blue-100 dark:text-blue-900"
              : "rounded-sm bg-blue-500/10 font-semibold text-blue-700 dark:bg-blue-400/15 dark:text-blue-300"
        }
      >
        {part.text}
      </span>
    ) : (
      part.text
    ),
  );
}
