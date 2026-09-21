"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, Paperclip, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Text } from "@/components/ui/typography";
import { MAX_SOURCE_BYTES, MAX_SOURCE_TEXT, type ActivitySource } from "@/lib/domain/activity-sources";

export function ActivitySources({ householdId, sources, onChange, disabled }: {
  householdId: string;
  sources: ActivitySource[];
  onChange: (sources: ActivitySource[]) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState<ActivitySource>();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const upload = useRef<AbortController | null>(null);
  useEffect(() => () => upload.current?.abort(), []);
  async function read(file: File) {
    setError("");
    if (file.size > MAX_SOURCE_BYTES) { setError("Choose a document smaller than 1 MB."); return; }
    const controller = new AbortController();
    upload.current = controller;
    setReading(true);
    try {
      const response = await fetch("/api/activity/sources", {
        method: "POST", body: file, signal: controller.signal,
        headers: { "x-household-id": householdId, "x-file-name": encodeURIComponent(file.name), "Content-Type": "application/octet-stream" },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDraft(data.source);
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Upload interrupted. Please try again.");
    } finally { if (!controller.signal.aborted) setReading(false); }
  }
  return <div className="min-w-0 space-y-3">
    {sources.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Attached references">
      {sources.map((source, i) => <div key={i} className="flex max-w-full items-center gap-2 rounded-xl border bg-background px-3 text-xs">
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate">Source {i + 1} · {source.name}</span>
        <Button size="icon" variant="ghost" className="size-11 shrink-0" disabled={disabled} aria-label={`Remove ${source.name}`} onClick={() => onChange(sources.filter((_, n) => n !== i))}><X className="size-3" /></Button>
      </div>)}
    </div>}
    {!draft && sources.length < 2 && <div className="flex flex-wrap gap-1">
      <input ref={fileInput} type="file" accept=".pdf,.txt,.md,.csv" className="sr-only" tabIndex={-1} aria-label="Upload reference document" disabled={disabled || reading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void read(file); event.target.value = ""; }} />
      <Button type="button" variant="ghost" size="sm" className="min-h-11 text-muted-foreground" disabled={disabled || reading} onClick={() => fileInput.current?.click()}><Paperclip className="size-4" />{reading ? "Reading document…" : "Attach document"}</Button>
      <Button type="button" variant="ghost" size="sm" className="min-h-11 text-muted-foreground" disabled={disabled || reading} onClick={() => { setError(""); setDraft({ name: "Pasted source", text: "" }); }}><Plus className="size-4" />Paste source</Button>
    </div>}
    {draft && <div className="space-y-3 rounded-xl border bg-muted/30 p-3" aria-label="Review reference">
      <Text small className="font-medium">Review what the AI will read</Text>
      <Text small muted>Keep bill details; remove account numbers and other personal information. Only this text is sent to OpenRouter when you send your message.</Text>
      <Input aria-label="Source name" value={draft.name} maxLength={100} disabled={disabled} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      <Textarea aria-label="Source text" placeholder="Paste relevant text from a bill, document, or webpage. Links alone aren’t fetched." value={draft.text} maxLength={MAX_SOURCE_TEXT} className="min-h-32 text-base" disabled={disabled} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" className="min-h-11" disabled={disabled || !draft.name.trim() || !draft.text.trim()} onClick={() => { onChange([...sources, draft]); setDraft(undefined); }}>Use source</Button>
        <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={disabled} onClick={() => setDraft(undefined)}>Discard</Button>
        <span className="text-xs text-muted-foreground">{draft.text.length.toLocaleString()} / 6,000</span>
      </div>
    </div>}
    {error && <Text small role="alert">{error}</Text>}
    <Text small muted className="text-xs">PDF, TXT, Markdown or CSV · 1 MB · up to 2 sources. References stay in this chat only.</Text>
  </div>;
}
