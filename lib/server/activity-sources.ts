import "server-only";
import { getDocumentProxy } from "unpdf";
import { DomainError } from "@/lib/domain/bills";
import {
  MAX_SOURCE_BYTES,
  MAX_SOURCE_TEXT,
  activitySourceSchema,
} from "@/lib/domain/activity-sources";
import { redactActivityText } from "./activity-interpreter";

export async function extractActivitySource(name: string, bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_SOURCE_BYTES)
    throw new DomainError("Choose a non-empty document smaller than 1 MB.");
  let text: string;
  if (/\.pdf$/i.test(name)) {
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
      throw new DomainError("That file is not a readable PDF.");
    const pdf = await getDocumentProxy(bytes, {
      verbosity: 0,
      stopAtErrors: true,
    });
    try {
      if (pdf.numPages > 10)
        throw new DomainError("Choose a PDF with at most 10 pages.");
      const pages: string[] = [];
      for (let page = 1; page <= pdf.numPages; page++) {
        const content = await (await pdf.getPage(page)).getTextContent();
        pages.push(
          content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" "),
        );
        if (pages.join("\n").length > MAX_SOURCE_TEXT)
          throw new DomainError(
            "This document has too much text. Paste the relevant bill details instead (up to 6,000 characters).",
          );
      }
      text = pages.join("\n");
    } finally {
      await pdf.loadingTask.destroy();
    }
  } else if (/\.(txt|md|csv)$/i.test(name)) {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new DomainError("Please upload a UTF-8 text document.");
    }
    if (text.includes("\0"))
      throw new DomainError("That file is not a text document.");
  } else {
    throw new DomainError(
      "Use PDF, TXT, Markdown, or CSV. You can also paste source text.",
    );
  }
  if (!text.trim())
    throw new DomainError(
      "No readable text was found. For scanned bills, paste the bill details instead.",
    );
  if (text.length > MAX_SOURCE_TEXT)
    throw new DomainError(
      "Paste the relevant details instead (up to 6,000 characters).",
    );
  return activitySourceSchema.parse({
    name: redactActivityText(name).slice(0, 100),
    text: redactActivityText(text),
  });
}
