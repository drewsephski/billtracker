import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, CircleAlert } from "lucide-react";
import type { ActionResult } from "@/lib/domain/types";
export function Feedback({ state }: { state: ActionResult }) {
  if (!state.error && !state.success) return null;
  return (
    <Alert
      variant={state.error ? "destructive" : "default"}
      role={state.error ? "alert" : "status"}
    >
      {state.error ? <CircleAlert /> : <CheckCircle2 />}
      <AlertDescription>{state.error || state.success}</AlertDescription>
    </Alert>
  );
}
