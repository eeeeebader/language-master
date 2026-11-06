import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Supabase auth schema; only referenced, never migrated by us. */
export const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
  email: text("email"),
});

const now = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const userOwned = {
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

// ---------- users, settings, streak ----------

export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  email: text("email"),
  nativeLanguage: text("native_language").notNull().default("de"),
  activeTargetLanguage: text("active_target_language").notNull().default("es"),
  isOver16: boolean("is_over_16").notNull().default(false),
  ageBand: text("age_band"),
  avatar: text("avatar").notNull().default("initials"),
  profileVisibility: text("profile_visibility").notNull().default("private"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }).notNull().defaultNow(),
  retentionWarnedAt: timestamp("retention_warned_at", { withTimezone: true }),
  createdAt: now(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const userLanguages = pgTable(
  "user_languages",
  {
    ...userOwned,
    language: text("language").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: now(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.language] })],
);

export const userSettings = pgTable(
  "user_settings",
  {
    ...userOwned,
    notificationsJson: jsonb("notifications_json").notNull().default({}),
    soundOn: boolean("sound_on").notNull().default(true),
    hapticsOn: boolean("haptics_on").notNull().default(true),
    dailyNewCards: integer("daily_new_cards").notNull().default(10),
    timezone: text("timezone").notNull().default("Europe/Berlin"),
    learningDays: jsonb("learning_days").notNull().default([1, 2, 3, 4, 5]),
    vacationUntil: text("vacation_until"),
    createdAt: now(),
  },
  (t) => [primaryKey({ columns: [t.userId] })],
);

export const streakLog = pgTable(
  "streak_log",
  {
    id: text("id").primaryKey(),
    ...userOwned,
    kind: text("kind").notNull(),
    from: text("from"),
    to: text("to"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("streak_log_user_idx").on(t.userId)],
);

// ---------- vocabulary ----------

export const userWords = pgTable(
  "user_words",
  {
    id: text("id").primaryKey(),
    ...userOwned,
    language: text("language").notNull(),
    lemma: text("lemma").notNull(),
    translation: text("translation").notNull(),
    pos: text("pos").notNull().default("other"),
    dictionaryRef: text("dictionary_ref"),
    // derived from review_events, never written by the client
    srsStability: real("srs_stability"),
    srsDifficulty: real("srs_difficulty"),
    srsDueAt: timestamp("srs_due_at", { withTimezone: true }),
    srsReps: integer("srs_reps").notNull().default(0),
    srsLapses: integer("srs_lapses").notNull().default(0),
    createdAt: now(),
  },
  (t) => [
    uniqueIndex("user_words_lemma_uq").on(t.userId, t.language, t.lemma),
    index("user_words_updated_idx").on(t.userId, t.updatedAt),
  ],
);

export const cardVariants = pgTable(
  "card_variants",
  {
    id: text("id").primaryKey(),
    ...userOwned,
    wordId: text("word_id")
      .notNull()
      .references(() => userWords.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    front: text("front").notNull(),
    back: text("back").notNull(),
    createdAt: now(),
  },
  (t) => [index("card_variants_word_idx").on(t.wordId)],
);

export const wordSentences = pgTable(
  "word_sentences",
  {
    id: text("id").primaryKey(),
    ...userOwned,
    wordId: text("word_id")
      .notNull()
      .references(() => userWords.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    text: text("text").notNull(),
    translation: text("translation").notNull(),
    source: text("source").notNull(),
    storyId: text("story_id"),
    sentenceId: text("sentence_id"),
    audioRef: text("audio_ref"),
    createdAt: now(),
  },
  (t) => [index("word_sentences_word_idx").on(t.wordId)],
);

export const responseProfiles = pgTable(
  "response_profiles",
  {
    ...userOwned,
    variantId: text("variant_id")
      .notNull()
      .references(() => cardVariants.id, { onDelete: "cascade" }),
    promptKind: text("prompt_kind").notNull(),
    emaMs: integer("ema_ms").notNull(),
    n: integer("n").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.variantId, t.promptKind] })],
);

export const reviewEvents = pgTable(
  "review_events",
  {
    id: text("id").primaryKey(), // ulid
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    variantId: text("variant_id").notNull(),
    wordId: text("word_id").notNull(),
    grade: smallint("grade").notNull(),
    reactionMs: integer("reaction_ms"),
    mode: text("mode").notNull(),
    promptKind: text("prompt_kind"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
    supersedes: text("supersedes"),
    manual: boolean("manual").notNull().default(false),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("review_events_user_word_idx").on(t.userId, t.wordId),
    index("review_events_user_received_idx").on(t.userId, t.receivedAt),
  ],
);

export const lists = pgTable(
  "lists",
  {
    id: text("id").primaryKey(),
    ...userOwned,
    language: text("language").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    colour: text("colour").notNull().default("sage"),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: now(),
  },
  (t) => [index("lists_user_updated_idx").on(t.userId, t.updatedAt)],
);

export const listWords = pgTable(
  "list_words",
  {
    ...userOwned,
    listId: text("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    wordId: text("word_id")
      .notNull()
      .references(() => userWords.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.listId, t.wordId] }),
    index("list_words_user_updated_idx").on(t.userId, t.updatedAt),
  ],
);

// ---------- entitlements, consents, legal ----------

export const entitlements = pgTable("entitlements", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  isPremium: boolean("is_premium").notNull().default(false),
  storyTokens: integer("story_tokens").notNull().default(0),
  isSupporter: boolean("is_supporter").notNull().default(false),
  supporterSince: timestamp("supporter_since", { withTimezone: true }),
  /** Admin override of stories.free_per_day for this user; null = app setting. */
  freeStoriesPerDay: integer("free_stories_per_day"),
  source: text("source"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tokenLedger = pgTable(
  "token_ledger",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(), // purchase | story | refund | grant
    refId: text("ref_id"),
    createdAt: now(),
  },
  (t) => [
    index("token_ledger_user_idx").on(t.userId),
    uniqueIndex("token_ledger_ref_uq").on(t.reason, t.refId),
  ],
);

export const consents = pgTable(
  "consents",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    document: text("document").notNull(), // agb | privacy
    version: integer("version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    ipHash: text("ip_hash"),
  },
  (t) => [
    index("consents_user_idx").on(t.userId),
    uniqueIndex("consents_user_doc_version_uq").on(t.userId, t.document, t.version),
  ],
);

export const legalDocuments = pgTable(
  "legal_documents",
  {
    id: text("id").primaryKey(),
    document: text("document").notNull(),
    locale: text("locale").notNull().default("de"),
    version: integer("version").notNull(),
    markdown: text("markdown").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    requiresReconsent: boolean("requires_reconsent").notNull().default(false),
    createdAt: now(),
  },
  (t) => [uniqueIndex("legal_documents_uq").on(t.document, t.locale, t.version)],
);

// ---------- content ----------

export const lectures = pgTable(
  "lectures",
  {
    id: text("id").primaryKey(),
    language: text("language").notNull(),
    slug: text("slug").notNull(),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("draft"), // draft | published
    contentJson: jsonb("content_json").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    edgesJson: jsonb("edges_json").notNull().default([]),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("lectures_uq").on(t.language, t.slug, t.version)],
);

export const lectureProgress = pgTable(
  "lecture_progress",
  {
    ...userOwned,
    lectureId: text("lecture_id").notNull(),
    doneAt: timestamp("done_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lectureId] })],
);

export const dictionaryPacks = pgTable(
  "dictionary_packs",
  {
    id: text("id").primaryKey(),
    target: text("target").notNull(),
    native: text("native").notNull(),
    version: integer("version").notNull(),
    url: text("url").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    withAudio: boolean("with_audio").notNull().default(false),
    /** Audio packs only: "core" (auto-installed) or "full" (opt-in). */
    audioTier: text("audio_tier"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: now(),
  },
  (t) => [
    uniqueIndex("dictionary_packs_uq").on(t.target, t.native, t.version, t.withAudio, t.audioTier),
  ],
);

export const stories = pgTable(
  "stories",
  {
    id: text("id").primaryKey(),
    /** null for official texts */
    userId: uuid("user_id").references(() => authUsers.id, { onDelete: "cascade" }),
    language: text("language").notNull(),
    native: text("native").notNull().default("de"),
    title: text("title").notNull(),
    theme: text("theme").notNull(),
    grammarFocus: text("grammar_focus"),
    level: smallint("level").notNull().default(1),
    source: text("source").notNull(), // ai | official
    status: text("status").notNull().default("ready"), // generating | ready | failed | published
    documentJson: jsonb("document_json").notNull(),
    sourceLists: jsonb("source_lists").notNull().default([]),
    generationCostCents: real("generation_cost_cents").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("stories_user_updated_idx").on(t.userId, t.updatedAt)],
);

export const llmUsage = pgTable(
  "llm_usage",
  {
    id: text("id").primaryKey(),
    storyId: text("story_id"),
    userId: uuid("user_id"),
    step: text("step").notNull(), // write | notes | moderation
    model: text("model").notNull(),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costCents: real("cost_cents").notNull().default(0),
    createdAt: now(),
  },
  (t) => [index("llm_usage_created_idx").on(t.createdAt)],
);

// ---------- admin ----------

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  valueJson: jsonb("value_json").notNull(),
  version: integer("version").notNull().default(1),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actor: uuid("actor"),
    table: text("table_name").notNull(),
    rowId: text("row_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_at_idx").on(t.at)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull().default("running"), // running | ok | failed
    summary: jsonb("summary"),
  },
  (t) => [index("jobs_name_started_idx").on(t.name, t.startedAt)],
);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id"),
    name: text("name").notNull(),
    props: jsonb("props").notNull().default({}),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("analytics_events_at_idx").on(t.at)],
);

/** Minimal pseudonymised record kept 10 years after account deletion (§ 147 AO). */
export const deletedAccounts = pgTable("deleted_accounts", {
  id: text("id").primaryKey(),
  emailHash: text("email_hash").notNull(),
  purchaseTotalCents: integer("purchase_total_cents").notNull().default(0),
  tokenPurchases: integer("token_purchases").notNull().default(0),
  wasPremium: boolean("was_premium").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
  keepUntil: timestamp("keep_until", { withTimezone: true })
    .notNull()
    .default(sql`now() + interval '10 years'`),
});

export const schemaMigrations = pgTable("schema_migrations", {
  name: text("name").primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- admin console (migration 0002) ----------

export const changelog = pgTable(
  "changelog",
  {
    id: text("id").primaryKey(),
    version: text("version").notNull(),
    locale: text("locale").notNull().default("de"),
    markdown: text("markdown").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("changelog_published_idx").on(t.publishedAt)],
);

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  percentage: smallint("percentage").notNull().default(0),
  users: jsonb("users").notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lemmaOverrides = pgTable(
  "lemma_overrides",
  {
    id: text("id").primaryKey(),
    language: text("language").notNull(),
    lemma: text("lemma").notNull(),
    patch: jsonb("patch").notNull(),
    updatedBy: uuid("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("lemma_overrides_uq").on(t.language, t.lemma)],
);

export const languages = pgTable(
  "languages",
  {
    target: text("target").notNull(),
    native: text("native").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.target, t.native] })],
);

/** Durable operations events (API errors, pack download failures, service checks). */
export const opsEvents = pgTable(
  "ops_events",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    data: jsonb("data").notNull().default({}),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ops_events_kind_at_idx").on(t.kind, t.at)],
);
