import { Blob, type BlobVariant } from "./blob";
import { Reveal } from "./ui/motion";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "./ui/empty";

export function FriendlyState({
  title,
  description,
  variant = "welcome",
  children,
}: {
  title: string;
  description: string;
  variant?: BlobVariant;
  children?: React.ReactNode;
}) {
  return (
    <Empty className="rounded-3xl border-0 bg-card py-8">
      <Reveal>
        <Blob variant={variant} className="mx-auto size-32" />
      </Reveal>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children}
    </Empty>
  );
}
