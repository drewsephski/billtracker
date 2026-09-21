import { Blob } from "./blob";
import { Reveal } from "./ui/motion";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "./ui/empty";

export function FriendlyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <Empty className="rounded-3xl border-0 bg-card py-8">
      <Reveal>
        <Blob className="mx-auto size-32" />
      </Reveal>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children}
    </Empty>
  );
}
