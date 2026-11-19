import { describe, expect, it } from "vitest";
import { classifyReply, replyAction, type Classification, type ReplyAction } from "@/lib/email/classify";

// Literal Stage-1 expectations, deliberately independent of the implementation.
describe("replyAction", () => {
  it("maps positive to SHORTLISTED-Hot with human notification and a calendly draft", () => {
    expect(replyAction("positive")).toEqual({
      status: "SHORTLISTED-Hot",
      notify_human: true,
      draft_reply: "calendly_link",
    });
  });

  it("maps soft_positive to Nurture with a one-pager and no human notification", () => {
    expect(replyAction("soft_positive")).toEqual({
      status: "Nurture",
      notify_human: false,
      send: "product_one_pager",
    });
  });

  it("maps negative to Do Not Contact with unsubscribe", () => {
    expect(replyAction("negative")).toEqual({
      status: "Do Not Contact",
      notify_human: true,
      unsubscribe: true,
    });
  });

  it("maps unsubscribe to Do Not Contact with unsubscribe", () => {
    expect(replyAction("unsubscribe")).toEqual({
      status: "Do Not Contact",
      notify_human: true,
      unsubscribe: true,
    });
  });

  it("maps no_response to Cold with a 60-day retarget", () => {
    expect(replyAction("no_response")).toEqual({ status: "Cold", retarget_days: 60 });
  });

  it("maps auto_reply to Cold with a 60-day retarget", () => {
    expect(replyAction("auto_reply")).toEqual({ status: "Cold", retarget_days: 60 });
  });

  it("maps unknown to Needs Human Review", () => {
    expect(replyAction("unknown")).toEqual({ status: "Needs Human Review", notify_human: true });
  });

  it("returns a typed ReplyAction for every member of the Classification union", () => {
    const allClasses: Classification[] = [
      "positive",
      "soft_positive",
      "negative",
      "unsubscribe",
      "no_response",
      "auto_reply",
      "unknown",
    ];
    for (const classification of allClasses) {
      const action: ReplyAction = replyAction(classification);
      expect(action).toBeTruthy();
    }
  });
});

describe("classifyReply", () => {
  it("stays deterministic across repeated calls for each core class", () => {
    const samples: Array<[string, Classification]> = [
      ["Yes, I'm interested — send the outline", "positive"],
      ["Maybe next month, check back", "soft_positive"],
      ["No thanks, not for me", "negative"],
      ["Please unsubscribe me", "unsubscribe"],
      ["I'm out of office until Monday", "auto_reply"],
      ["Hello there", "unknown"],
      ["", "unknown"],
    ];
    for (const [body, expected] of samples) {
      const first = classifyReply(body);
      const second = classifyReply(body);
      expect(first).toEqual(second);
      expect(first.classification).toBe(expected);
      expect(first.confidence).toBeGreaterThanOrEqual(0);
      expect(first.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the documented confidence ordering", () => {
    expect(classifyReply("Please unsubscribe me").confidence).toBe(0.97);
    expect(classifyReply("No thanks").confidence).toBe(0.86);
    expect(classifyReply("Interested").confidence).toBe(0.83);
    expect(classifyReply("Maybe later").confidence).toBe(0.61);
    expect(classifyReply("").confidence).toBe(0);
  });

  it("does not emit no_response from a reply body (that is a sequence state)", () => {
    expect(classifyReply("Still no word from them").classification).not.toBe("no_response");
  });
});
