import type { UIMessage } from "ai";
import type { ActivityReply } from "./activity";
export type ActivityMessage = UIMessage<unknown, { activity: ActivityReply }>;
