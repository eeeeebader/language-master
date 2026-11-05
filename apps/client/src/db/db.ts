import type {
  ActivityDay,
  CardState,
  CardVariant,
  ListWord,
  ResponseProfile,
  ReviewEvent,
  StoryDocument,
  StreakLogEntry,
  UserSettings,
  UserWord,
  WordList,
  WordSentence,
} from "@lm/schema";
import Dexie, { type EntityTable } from "dexie";

export interface SettingsRow extends UserSettings {
  key: "me";
}

export interface LectureProgressRow {
  lectureId: string;
  doneAt: string;
}

export interface StoryProgressRow {
  storyId: string;
  /** index of the last visible sentence */
  position: number;
  finishedAt: string | null;
  tappedLemmas: string[];
  updatedAt: string;
}

export interface StoryRow extends StoryDocument {
  archived: boolean;
}

/** In-app inbox item (changelog, legal update, announcement); never a system notification. */
export interface InboxRow {
  id: string;
  kind: "changelog" | "legal" | "announcement";
  title: string;
  markdown: string;
  at: string;
  read: boolean;
  requiresReconsent?: boolean;
  document?: string;
  version?: number;
}

/** Downloaded dictionary pack bytes; one row per (target, native). */
/** One pre-rendered clip, keyed by the exact text it voices. */
export interface AudioClipRow {
  key: string;
  mime: string;
  bytes: Uint8Array;
}

export interface PackFileRow {
  key: string;
  version: number;
  bytes: Uint8Array;
  sha256: string;
  installedAt: string;
}

export class LanguageMasterDB extends Dexie {
  settings!: EntityTable<SettingsRow, "key">;
  words!: EntityTable<UserWord, "id">;
  variants!: EntityTable<CardVariant, "id">;
  sentences!: EntityTable<WordSentence, "id">;
  lists!: EntityTable<WordList, "id">;
  listWords!: Dexie.Table<ListWord, [string, string]>;
  events!: EntityTable<ReviewEvent, "id">;
  cardStates!: EntityTable<CardState, "variantId">;
  profiles!: Dexie.Table<ResponseProfile, [string, string]>;
  activity!: EntityTable<ActivityDay, "day">;
  streakLog!: EntityTable<StreakLogEntry, "id">;
  lectureProgress!: EntityTable<LectureProgressRow, "lectureId">;
  stories!: EntityTable<StoryRow, "id">;
  storyProgress!: EntityTable<StoryProgressRow, "storyId">;
  packFiles!: EntityTable<PackFileRow, "key">;
  audioClips!: EntityTable<AudioClipRow, "key">;
  inbox!: EntityTable<InboxRow, "id">;

  constructor(name = "language-master") {
    super(name);
    this.version(1).stores({
      settings: "key",
      words: "id, &[language+lemma], language, updatedAt",
      variants: "id, wordId, [wordId+kind]",
      sentences: "id, wordId",
      lists: "id, language, updatedAt",
      listWords: "[listId+wordId], listId, wordId",
      events: "id, variantId, wordId, reviewedAt, synced",
      cardStates: "variantId, wordId, due",
      profiles: "[variantId+promptKind], variantId",
      activity: "day",
      streakLog: "id, kind, at",
      lectureProgress: "lectureId",
      stories: "id, language, createdAt",
      storyProgress: "storyId",
    });
    this.version(2).stores({ packFiles: "key" });
    this.version(3).stores({ audioClips: "key" });
    this.version(4).stores({ inbox: "id, at, read" });
  }
}

export const db = new LanguageMasterDB();
