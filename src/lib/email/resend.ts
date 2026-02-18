import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);

export const FROM_ADDRESS = `${process.env.FROM_NAME ?? "Poveon Health"} <${process.env.FROM_EMAIL ?? "noreply@poveon.health"}>`;
