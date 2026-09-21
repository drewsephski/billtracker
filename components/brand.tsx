import Link from "next/link";
import { House } from "lucide-react";
import { Button } from "@/components/ui/button";
export function Brand() {
  return (
    <Button variant="ghost" asChild className="justify-start">
      <Link href="/" aria-label="Homeshare home">
        <House data-icon="inline-start" />
        <span className="text-xl font-semibold tracking-tight">
          homeshare<span className="text-primary">.</span>
        </span>
      </Link>
    </Button>
  );
}
