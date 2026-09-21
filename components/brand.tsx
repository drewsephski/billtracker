import Link from "next/link";
import { Blob } from "./blob";
import { Button } from "@/components/ui/button";
export function Brand() {
  return (
    <Button
      variant="ghost"
      asChild
      className="justify-start gap-1.5 px-0 hover:bg-transparent"
    >
      <Link href="/" aria-label="Homeshare home">
        <Blob sizes="36px" className="size-9" />
        <span className="text-xl font-semibold tracking-[-0.055em]">
          homeshare<span className="text-primary">.</span>
        </span>
      </Link>
    </Button>
  );
}
