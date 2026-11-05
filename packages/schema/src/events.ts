import { z } from "zod";

/**
 * Product analytics events (PostHog Cloud EU). Pseudonymous: the distinct id is the Supabase
 * user id, never an e-mail or advertising id, and no event carries free text.
 */
export const AnalyticsEvent = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("onboarding_completed"),
    props: z.object({ skipped_session: z.boolean() }),
  }),
  z.object({ name: z.literal("tour_finished"), props: z.object({ skipped: z.boolean() }) }),
  z.object({
    name: z.literal("session_started"),
    props: z.object({
      mode: z.enum(["classic", "reaction", "progressive", "forever"]),
      cards: z.number().int(),
    }),
  }),
  z.object({
    name: z.literal("session_finished"),
    props: z.object({
      mode: z.enum(["classic", "reaction", "progressive", "forever"]),
      cards: z.number().int(),
      answers: z.number().int(),
      skipped: z.number().int(),
      duration_s: z.number().int(),
    }),
  }),
  z.object({ name: z.literal("lecture_done"), props: z.object({ lecture: z.string() }) }),
  z.object({
    name: z.literal("story_read"),
    props: z.object({ source: z.enum(["ai", "official"]) }),
  }),
  z.object({
    name: z.literal("story_generated"),
    props: z.object({
      ok: z.boolean(),
      payment: z.string().optional(),
      error: z.string().optional(),
      level: z.number().int(),
      length: z.number().int(),
    }),
  }),
  z.object({
    name: z.literal("word_added"),
    props: z.object({ source: z.enum(["dictionary", "story", "lecture", "custom"]) }),
  }),
  z.object({
    name: z.literal("pack_installed"),
    props: z.object({ kind: z.enum(["dictionary", "audio"]), version: z.number().int() }),
  }),
  z.object({
    name: z.literal("purchase_started"),
    props: z.object({ product: z.string(), channel: z.enum(["stripe", "store"]) }),
  }),
  z.object({ name: z.literal("signed_in"), props: z.object({}) }),
]);
export type AnalyticsEvent = z.infer<typeof AnalyticsEvent>;
export type AnalyticsEventName = AnalyticsEvent["name"];
