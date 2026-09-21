import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
export default function NotFound() {
  return (
    <Empty className="min-h-[70vh]">
      <EmptyHeader>
        <EmptyTitle>Looks like the wrong door.</EmptyTitle>
        <EmptyDescription>
          This page doesn’t exist, or it isn’t part of your household.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link href="/dashboard">Back to your household</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
