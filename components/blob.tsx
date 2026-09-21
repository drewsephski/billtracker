import Image from "next/image";
import { cn } from "@/lib/utils";

const artwork = {
  welcome: "/images/homeshare-blob.png",
  key: "/images/blobs/blob-key.png",
  receipt: "/images/blobs/blob-receipt.png",
  home: "/images/blobs/blob-home.png",
  calendar: "/images/blobs/blob-calendar.png",
  coins: "/images/blobs/blob-coins.png",
  chat: "/images/blobs/blob-chat.png",
} as const;

export type BlobVariant = keyof typeof artwork;

/** Decorative brand artwork; meaningful state copy always lives beside it. */
export function Blob({
  className,
  variant = "welcome",
  sizes = "128px",
  priority = false,
}: {
  className?: string;
  variant?: BlobVariant;
  sizes?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={artwork[variant]}
      alt=""
      aria-hidden
      width={1254}
      height={1254}
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      className={cn(
        "pointer-events-none select-none object-contain",
        className,
      )}
    />
  );
}
