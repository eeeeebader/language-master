import { Lecture } from "@lm/schema";

export interface LectureIssue {
  file: string;
  message: string;
}

/** Validate lecture JSON documents and check that vocab_bundle lemmas resolve. */
export function validateLectures(
  docs: { file: string; json: unknown }[],
  hasLemma: (lemma: string) => boolean,
): LectureIssue[] {
  const issues: LectureIssue[] = [];
  const ids = new Set<string>();
  const parsed: { file: string; lecture: Lecture }[] = [];
  for (const d of docs) {
    const r = Lecture.safeParse(d.json);
    if (!r.success) {
      issues.push({
        file: d.file,
        message: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
      continue;
    }
    if (ids.has(r.data.id)) issues.push({ file: d.file, message: `duplicate id ${r.data.id}` });
    ids.add(r.data.id);
    parsed.push({ file: d.file, lecture: r.data });
  }
  for (const { file, lecture } of parsed) {
    for (const req of lecture.requires)
      if (!ids.has(req)) issues.push({ file, message: `requires unknown lecture ${req}` });
    for (const b of lecture.blocks) {
      if (b.type === "vocab_bundle")
        for (const l of b.lemmas)
          if (!hasLemma(l))
            issues.push({ file, message: `vocab_bundle ${b.id}: lemma "${l}" not in pack` });
      if (b.type === "quick_check")
        for (const q of b.questions)
          if (q.answer >= q.options.length)
            issues.push({ file, message: `quick_check ${b.id}: answer index out of range` });
    }
  }
  return issues;
}

/** Every text that needs pre-rendered audio, keyed by a stable id. */
export function audioTexts(lecture: Lecture): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  for (const b of lecture.blocks) {
    switch (b.type) {
      case "alphabet_grid":
        for (const [i, l] of b.letters.entries())
          out.push({ id: `${lecture.id}.${b.id}.${i}`, text: l.example });
        break;
      case "number_table":
        for (const r of b.rows) out.push({ id: `${lecture.id}.${b.id}.${r.value}`, text: r.word });
        break;
      case "conjugation_mini":
        for (const [i, p] of b.persons.entries())
          out.push({ id: `${lecture.id}.${b.id}.${i}`, text: p.form });
        break;
      case "dialogue":
        for (const [i, l] of b.lines.entries())
          out.push({ id: `${lecture.id}.${b.id}.${i}`, text: l.text });
        break;
      case "rule_card":
        for (const [i, e] of b.examples.entries())
          out.push({ id: `${lecture.id}.${b.id}.${i}`, text: e.text });
        break;
      default:
        break;
    }
  }
  return out;
}
