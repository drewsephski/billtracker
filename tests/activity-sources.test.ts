import { describe, expect, it, vi } from "vitest";
import { extractActivitySource } from "@/lib/server/activity-sources";
import { activitySourcesSchema } from "@/lib/domain/activity-sources";

const bytes = (text: string) => new TextEncoder().encode(text);
describe("reviewable document references", () => {
  it.each(["bill.txt", "bill.md", "bill.csv"])(
    "extracts %s without sending it to a provider",
    async (name) => {
      const fetch = vi.spyOn(globalThis, "fetch");
      const source = await extractActivitySource(
        name,
        bytes("Water total $90.00 due 2026-10-28. me@example.com"),
      );
      expect(source.text).toContain("$90.00");
      expect(source.text).not.toContain("me@example.com");
      expect(fetch).not.toHaveBeenCalled();
      fetch.mockRestore();
    },
  );
  it.each([
    ["bad.pdf", "not a PDF"],
    ["script.html", "<script>alert(1)</script>"],
    ["empty.txt", " "],
    ["binary.txt", "\0binary"],
    ["large.txt", "a".repeat(6001)],
  ])(
    "rejects unsupported, empty, malformed and oversized source %s",
    async (name, content) => {
      await expect(
        extractActivitySource(name, bytes(content)),
      ).rejects.toThrow();
    },
  );
  it("limits count, text and shape independently of the upload UI", () => {
    const source = { name: "Bill", text: "Total $90" };
    expect(
      activitySourcesSchema.safeParse([source, source, source]).success,
    ).toBe(false);
    expect(
      activitySourcesSchema.safeParse([{ ...source, text: "a".repeat(6001) }])
        .success,
    ).toBe(false);
    expect(
      activitySourcesSchema.safeParse([{ ...source, url: "http://localhost" }])
        .success,
    ).toBe(false);
  });
  it("reads a real text PDF and retains cent-accurate amounts", async () => {
    // Minimal self-contained synthetic PDF, no external fixture or real bill data.
    const stream =
      "BT /F1 12 Tf 20 100 Td (Water total $90.00 due 2026-10-28) Tj ET";
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, i) => {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
      .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const source = await extractActivitySource("water.pdf", bytes(pdf));
    expect(source.text).toContain("$90.00");
    expect(source.text).toContain("2026-10-28");
  });
});
