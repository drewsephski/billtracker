import { z } from "zod";
import {
  activeActivityContext,
  activityBody,
  activityError,
} from "@/lib/server/activity-http";
import { readHousehold } from "@/lib/server/queries";
import { activitySuggestions } from "@/lib/server/activity-suggestions";
export const runtime = "nodejs";
export const maxDuration = 15;
export async function POST(request: Request) {
  try {
    const { householdId: expected } = z
      .strictObject({ householdId: z.uuid() })
      .parse(await activityBody(request));
    const { user, householdId } = await activeActivityContext(expected);
    const data = await readHousehold(user, householdId);
    return Response.json(
      { prompts: await activitySuggestions(data) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json({ error: activityError(error) }, { status: 400 });
  }
}
