import { z } from "zod";
import { activeActivityContext } from "@/lib/server/activity-http";
import { extractActivitySource } from "@/lib/server/activity-sources";
import { DomainError } from "@/lib/domain/bills";
import { MAX_SOURCE_BYTES } from "@/lib/domain/activity-sources";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw new DomainError("Please upload documents from Homeshare.");
    await activeActivityContext(z.uuid().parse(request.headers.get("x-household-id")));
    const name = z.string().min(1).max(100).parse(decodeURIComponent(request.headers.get("x-file-name") ?? ""));
    if (Number(request.headers.get("content-length")) > MAX_SOURCE_BYTES)
      throw new DomainError("Choose a document smaller than 1 MB.");
    const reader = request.body?.getReader();
    if (!reader) throw new DomainError("The document is empty.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_SOURCE_BYTES) {
          await reader.cancel();
          throw new DomainError("Choose a document smaller than 1 MB.");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const source = await extractActivitySource(name, new Uint8Array(Buffer.concat(chunks)));
    return Response.json({ source }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof DomainError ? error.message : "I couldn’t read that document. Try a text PDF or paste the relevant details." }, { status: 400 });
  }
}
