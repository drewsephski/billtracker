import Link from "next/link";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-5 py-6 sm:px-10">
        <Brand />
        <Button variant="ghost" asChild>
          <Link href="/">Back home</Link>
        </Button>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-10 sm:px-10 sm:pt-16">
        <div className="border-b pb-8">
          <Heading className="text-4xl leading-tight sm:text-5xl">
            {title}
          </Heading>
          <Text muted className="mt-4 max-w-2xl text-lg leading-relaxed">
            {intro}
          </Text>
        </div>
        <article className="prose prose-neutral mt-10 max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-p:leading-7 prose-li:leading-7">
          {children}
        </article>
      </main>
      <footer className="border-t px-5 py-8 sm:px-10">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4">
          <Text small muted>
            For the people you share a roof with.
          </Text>
          <nav aria-label="Legal" className="flex gap-4 text-sm">
            <Link
              className="text-muted-foreground underline-offset-4 hover:underline"
              href="/terms"
            >
              Terms of Service
            </Link>
            <Link
              className="text-muted-foreground underline-offset-4 hover:underline"
              href="/privacy"
            >
              Privacy Policy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
