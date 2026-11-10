import { z } from "zod";
import type { WorkRecordKind } from "@/db/schema";
const text = (max: number) => z.string().trim().max(max);
const email = z.union([z.literal(""), z.string().email().max(254)]);
export const DEAL_STAGES = [
  "lead",
  "qualified",
  "proposal",
  "won",
  "lost",
] as const;
export const CONTENT_TYPES = [
  "social_post",
  "newsletter",
  "article",
  "document",
] as const;
export const recordSchemas = {
  folder: z.object({ description: text(500).default("") }).strict(),
  file: z
    .object({
      fileName: text(180)
        .min(1)
        .refine(
          (s) => !/[\/\\\r\n\x00]/.test(s),
          "Use a file name without path separators.",
        ),
      mediaType: text(100).default("text/plain"),
      body: z.string().max(200000).default(""),
      uploaded: z.boolean().default(false),
    })
    .strict(),
  event: z
    .object({
      startAt: z.string().datetime({ offset: true }),
      endAt: z.string().datetime({ offset: true }),
      timeZone: text(80).refine((s) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: s });
          return true;
        } catch {
          return false;
        }
      }, "Choose a valid time zone."),
      location: text(300).default(""),
      notes: text(10000).default(""),
    })
    .strict()
    .refine(
      (v) =>
        Date.parse(v.endAt) > Date.parse(v.startAt) &&
        Date.parse(v.endAt) - Date.parse(v.startAt) <= 90 * 86400000,
      "End must follow start, within 90 days.",
    ),
  company: z
    .object({
      website: z
        .union([
          z.literal(""),
          z
            .string()
            .url()
            .max(500)
            .refine((s) => ["http:", "https:"].includes(new URL(s).protocol)),
        ])
        .default(""),
      industry: text(120).default(""),
      notes: text(10000).default(""),
    })
    .strict(),
  contact: z
    .object({
      email: email.default(""),
      phone: text(80).default(""),
      jobTitle: text(120).default(""),
      companyId: text(80).nullable().default(null),
      notes: text(10000).default(""),
    })
    .strict(),
  deal: z
    .object({
      companyId: text(80).nullable().default(null),
      stage: z.enum(DEAL_STAGES),
      valueCents: z.number().int().nonnegative().max(100_000_000_000),
      currency: z.string().regex(/^[A-Z]{3}$/),
      notes: text(10000).default(""),
    })
    .strict(),
  content: z
    .object({
      contentType: z.enum(CONTENT_TYPES),
      channel: text(100).default(""),
      body: z.string().max(50000).default(""),
    })
    .strict(),
  mail: z
    .object({ to: email, body: z.string().max(50000).default("") })
    .strict(),
} as const;
export const RECORD_ROUTES: Record<WorkRecordKind, string> = {
  folder: "/drive",
  file: "/drive",
  event: "/calendar",
  company: "/crm",
  contact: "/crm",
  deal: "/crm",
  content: "/library",
  mail: "/mailbox",
};
