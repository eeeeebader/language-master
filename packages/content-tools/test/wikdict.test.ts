import { describe, expect, it } from "vitest";
import { parseFrequencyList, wikdictPos } from "../src/wikdict";

describe("wikdict", () => {
  it("maps lexentry tags to parts of speech and gender", () => {
    expect(wikdictPos("spa/perro__sustantivo_masculino_y_femenino__1")).toEqual({
      pos: "noun",
      gender: "mf",
    });
    expect(wikdictPos("spa/casa__sustantivo_femenino__1")).toEqual({ pos: "noun", gender: "f" });
    expect(wikdictPos("spa/hablar__verbo_intransitivo__1")).toEqual({ pos: "verb" });
    expect(wikdictPos("spa/contento__adjetivo__1")).toEqual({ pos: "adj" });
    expect(wikdictPos("spa/-able__sufijo__1")).toBeNull();
    expect(wikdictPos(null)).toEqual({ pos: "other" });
  });

  it("parses the frequency list into ranks", () => {
    const r = parseFrequencyList("de 14459520\nque 14421005\n\nno 12379505\nde 1\n");
    expect(r.get("de")).toBe(1);
    expect(r.get("no")).toBe(3);
    expect(r.size).toBe(3);
  });
});
