import { z } from "zod";
import { IsoDateTime, NativeLanguage, StudyLanguage } from "./common";

/** 0 = Sunday … 6 = Saturday, matching Date#getDay */
export const Weekday = z.number().int().min(0).max(6);

export const UserSettings = z.object({
  username: z.string().min(1).max(32),
  avatar: z.string().default("initials"),
  nativeLanguage: NativeLanguage.default("de"),
  activeLanguage: StudyLanguage.default("es"),
  isOver16: z.boolean(),
  consentVersion: z.number().int().default(1),
  consentedAt: IsoDateTime,
  soundOn: z.boolean().default(true),
  hapticsOn: z.boolean().default(true),
  dailyNewCards: z.number().int().min(1).max(100).default(10),
  learningDays: z.array(Weekday).default([1, 2, 3, 4, 5]),
  vacationUntil: z.string().nullable().default(null),
  onboardingDone: z.boolean().default(false),
  tourDone: z.boolean().default(false),
  createdAt: IsoDateTime,
});
export type UserSettings = z.infer<typeof UserSettings>;

export const StreakLogEntry = z.object({
  id: z.string(),
  kind: z.enum(["vacation", "reactivation", "learning_days_changed"]),
  from: z.string().optional(),
  to: z.string().optional(),
  at: IsoDateTime,
});
export type StreakLogEntry = z.infer<typeof StreakLogEntry>;

/** One row per local calendar day with learning activity. */
export const ActivityDay = z.object({
  /** yyyy-mm-dd in device local time */
  day: z.string(),
  reviews: z.number().int().nonnegative().default(0),
  lecturesDone: z.number().int().nonnegative().default(0),
  storiesRead: z.number().int().nonnegative().default(0),
  minutes: z.number().nonnegative().default(0),
});
export type ActivityDay = z.infer<typeof ActivityDay>;
