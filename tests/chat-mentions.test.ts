import { expect, it } from "vitest";
import {
  insertHomeshareMention,
  mentionParts,
  mentionQuery,
} from "@/lib/domain/chat-mentions";
it("opens the picker only for a matching mention at the caret", () => {
  expect(mentionQuery("Hey @", 5)).toEqual({ start: 4, end: 5 });
  expect(mentionQuery("@ho", 3)).toEqual({ start: 0, end: 3 });
  expect(mentionQuery("@HOME", 5)).toEqual({ start: 0, end: 5 });
  expect(mentionQuery("alex@example.com", 8)).toBeNull();
  expect(mentionQuery("@someone", 8)).toBeNull();
  expect(mentionQuery("@Homeshare ", 11)).toBeNull();
});
it("inserts a mention at the caret without losing surrounding text", () => {
  expect(insertHomeshareMention("Hey @ho", { start: 4, end: 7 })).toEqual({
    text: "Hey @Homeshare ",
    caret: 15,
  });
  expect(
    insertHomeshareMention("Ask @ho about bills", { start: 4, end: 7 }),
  ).toEqual({ text: "Ask @Homeshare about bills", caret: 15 });
});
it("highlights complete mentions, including repeated mentions, without treating emails as mentions", () => {
  const input = "@Homeshare hi @homeshare! alex@Homeshare.com @HomeshareExtra";
  const parts = mentionParts(input);
  expect(parts.map((p) => p.text).join("")).toBe(input);
  expect(parts.filter((p) => p.mention).map((p) => p.text)).toEqual([
    "@Homeshare",
    "@homeshare",
  ]);
});
