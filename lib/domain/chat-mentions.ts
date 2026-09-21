export const HOMESHARE_MENTION = "@Homeshare";
export function mentionQuery(text: string, caret: number) {
  const prefix = text.slice(0, caret);
  const match = /(?:^|[\s(])@([a-z]*)$/i.exec(prefix);
  if (!match || !"homeshare".startsWith(match[1].toLowerCase())) return null;
  const start = caret - match[1].length - 1;
  const rest = /^[a-z]*/i.exec(text.slice(caret))![0];
  return { start, end: caret + rest.length };
}
export function insertHomeshareMention(
  text: string,
  range: { start: number; end: number },
) {
  const suffix = text.slice(range.end);
  const separator = /^\s/.test(suffix) ? "" : " ";
  const prefix = `${text.slice(0, range.start)}${HOMESHARE_MENTION}${separator}`;
  return { text: prefix + suffix, caret: prefix.length + (separator ? 0 : 1) };
}
export function mentionParts(
  text: string,
): { text: string; mention: boolean }[] {
  const result: { text: string; mention: boolean }[] = [];
  const pattern = /(^|[^\w@])(@Homeshare)\b/gi;
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    const mentionStart = match.index + match[1].length;
    if (mentionStart > start)
      result.push({ text: text.slice(start, mentionStart), mention: false });
    result.push({ text: match[2], mention: true });
    start = mentionStart + match[2].length;
  }
  if (start < text.length)
    result.push({ text: text.slice(start), mention: false });
  return result;
}
