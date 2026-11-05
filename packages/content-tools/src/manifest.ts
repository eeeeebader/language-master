import { z } from "zod";

/** Pack manifest served from Supabase Storage; the app checks it on launch. */
export const PackManifest = z.object({
  target: z.string().min(2),
  native: z.string().min(2),
  version: z.number().int().positive(),
  url: z.string().url(),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  with_audio: z.boolean(),
  audio_url: z.string().url().optional(),
  audio_bytes: z.number().int().positive().optional(),
  audio_sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  published_at: z.string().datetime({ offset: true }),
});
export type PackManifest = z.infer<typeof PackManifest>;

export const packFileName = (target: string, native: string, version: number) =>
  `${target}-${native}.v${version}.sqlite`;
