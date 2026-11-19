import { describe, expect, it } from "vitest";
import {
  checkVoiceText,
  normalizeText,
  onlyVerbatimPhrases,
  type VoiceProfile,
} from "@/lib/analysis/voice";

// Literal expectations, deliberately independent of the implementation.
describe("normalizeText", () => {
  it("trims, lowercases and collapses all whitespace runs", () => {
    expect(normalizeText("  Hello   WORLD\tagain \n")).toBe("hello world again");
  });

  it("strips only leading and trailing punctuation", () => {
    expect(normalizeText("!!! Real, talk. ???")).toBe("real, talk");
    expect(normalizeText("...wow!!!")).toBe("wow");
  });

  it("returns an empty string for blank or punctuation-only input", () => {
    expect(normalizeText("   ")).toBe("");
    expect(normalizeText("!!!")).toBe("");
  });
});

describe("onlyVerbatimPhrases", () => {
  it("keeps only source-backed phrases, trimmed, deduped and in order", () => {
    expect(
      onlyVerbatimPhrases(
        [" I build systems ", "invented catchphrase", "I build systems", "real talk"],
        ["I build systems that last. We use real talk."],
      ),
    ).toEqual(["I build systems", "real talk"]);
  });

  it("matches across joined sources ignoring case and whitespace runs", () => {
    expect(onlyVerbatimPhrases(["Let's   go"], ["let's", "go together"])).toEqual(["Let's   go"]);
  });

  it("returns nothing for blank phrases or an empty source", () => {
    expect(onlyVerbatimPhrases(["   ", "anything"], [])).toEqual([]);
  });
});

describe("checkVoiceText", () => {
  const voice: VoiceProfile = {
    tone: ["direct"],
    topPhrases: ["I build systems", "real talk"],
    signatureStories: ["first client"],
    neverSays: ["synergy", "game-changer"],
  };

  it("passes when approved phrases appear and no banned phrase does", () => {
    expect(checkVoiceText("I build systems, real talk.", voice)).toEqual({
      passed: true,
      banned: [],
      observed: ["I build systems", "real talk"],
    });
  });

  it("detects a banned phrase case-insensitively and fails", () => {
    const result = checkVoiceText("That is pure SYNERGY for us.", voice);
    expect(result.passed).toBe(false);
    expect(result.banned).toEqual(["synergy"]);
    expect(result.observed).toEqual([]);
  });

  it("passes an empty voice profile without fabricating a failure", () => {
    const empty: VoiceProfile = {
      tone: [],
      topPhrases: [],
      signatureStories: [],
      neverSays: [],
    };
    expect(checkVoiceText("anything at all", empty)).toEqual({ passed: true, banned: [], observed: [] });
    expect(checkVoiceText("", empty)).toEqual({ passed: true, banned: [], observed: [] });
  });

  it("ignores blank phrase entries", () => {
    const weird: VoiceProfile = {
      tone: [],
      topPhrases: ["   "],
      signatureStories: [],
      neverSays: ["!!!"],
    };
    expect(checkVoiceText("anything", weird)).toEqual({ passed: true, banned: [], observed: [] });
  });
});
