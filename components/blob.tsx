import Image from "next/image";
import { cn } from "@/lib/utils";

/** Decorative brand artwork; meaningful state copy always lives beside it. */
export function Blob({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/images/homeshare-blob.png"
      alt=""
      aria-hidden
      width={1024}
      height={1024}
      sizes="(max-width: 640px) 180px, 320px"
      priority={priority}
      className={cn(
        "pointer-events-none select-none object-contain",
        className,
      )}
    />
  );
}
