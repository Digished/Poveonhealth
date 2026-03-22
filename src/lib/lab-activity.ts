import { prisma } from "@/lib/prisma";

export interface LogActivityParams {
  lab_id: string;
  actor_email: string;
  actor_role?: string;
  action: string;
  detail?: string;
}

/** Fire-and-forget activity logger — never throws, never blocks responses. */
export function logLabActivity(params: LogActivityParams) {
  prisma.labActivity
    .create({
      data: {
        lab_id: params.lab_id,
        actor_email: params.actor_email,
        actor_role: params.actor_role ?? "owner",
        action: params.action,
        detail: params.detail ?? null,
      },
    })
    .catch((e) => console.error("[lab-activity] log failed:", e));
}
