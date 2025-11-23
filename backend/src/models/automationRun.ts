import * as admin from "firebase-admin";

export type AutomationRunStatus = "success" | "partial" | "error";

export type AutomationEventLevel = "info" | "warn" | "error";

export type AutomationEventStep =
  | "select-channels"
  | "channel-check"
  | "generate-idea"
  | "generate-prompt"
  | "create-job"
  | "send-to-bot"
  | "update-channel-next-run"
  | "other";

export interface AutomationRun {
  id: string;
  startedAt: admin.firestore.Timestamp;
  finishedAt?: admin.firestore.Timestamp;
  status: AutomationRunStatus;
  schedulerInvocationAt?: admin.firestore.Timestamp;
  channelsPlanned: number;
  channelsProcessed: number;
  jobsCreated: number;
  errorsCount: number;
  lastErrorMessage?: string;
  timezone: string;
}

export interface AutomationEvent {
  runId: string;
  createdAt: admin.firestore.Timestamp;
  level: AutomationEventLevel;
  step: AutomationEventStep;
  channelId?: string;
  channelName?: string;
  message: string;
  details?: Record<string, any>;
}

