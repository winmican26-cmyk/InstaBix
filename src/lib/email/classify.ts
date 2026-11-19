export type Classification =
  | "positive"
  | "soft_positive"
  | "negative"
  | "unsubscribe"
  | "no_response"
  | "auto_reply"
  | "unknown";

const UNSUBSCRIBE = /\b(unsubscribe|remove me|stop emailing|take me off|do not contact|don'?t contact)\b/i;
const NEGATIVE = /\b(not interested|no thanks|no thank you|pass\b|not for me|decline|won'?t work|too busy to discuss|not a fit)\b/i;
const AUTO = /\b(out of office|automatic reply|auto-reply|on leave|vacation|will be back)\b/i;
const POSITIVE = /\b(interested|sounds good|send (me )?(the |an )?outline|tell me more|let'?s do it|yes\b|keen|count me in|happy to)\b/i;
const SOFT = /\b(maybe|perhaps|next month|check back|later|possibly|curious|what would that look like|more info)\b/i;

/**
 * Deterministic first pass. It is intentionally conservative: ambiguous replies
 * stay `unknown` and a human decides. No money or consent decision depends on it.
 */
export function classifyReply(body: string): { classification: Classification; confidence: number } {
  const text = body.trim();
  if (!text) return { classification: "unknown", confidence: 0 };
  if (UNSUBSCRIBE.test(text)) return { classification: "unsubscribe", confidence: 0.97 };
  if (AUTO.test(text)) return { classification: "auto_reply", confidence: 0.9 };
  if (NEGATIVE.test(text)) return { classification: "negative", confidence: 0.86 };
  if (POSITIVE.test(text)) return { classification: "positive", confidence: 0.83 };
  if (SOFT.test(text)) return { classification: "soft_positive", confidence: 0.61 };
  return { classification: "unknown", confidence: 0.2 };
}

/**
 * Concrete Stage-1 workflow action for each reply class. This mirrors
 * backend/app/agents/agent2.py::reply_action. Week 1-2 still requires a human
 * approval step before any send, even where notify_human is false.
 */
export type ReplyAction =
  | { status: "SHORTLISTED-Hot"; notify_human: true; draft_reply: "calendly_link" }
  | { status: "Nurture"; notify_human: false; send: "product_one_pager" }
  | { status: "Do Not Contact"; notify_human: true; unsubscribe: true }
  | { status: "Cold"; retarget_days: 60 }
  | { status: "Needs Human Review"; notify_human: true };

export function replyAction(classification: Classification): ReplyAction {
  switch (classification) {
    case "positive":
      return { status: "SHORTLISTED-Hot", notify_human: true, draft_reply: "calendly_link" };
    case "soft_positive":
      return { status: "Nurture", notify_human: false, send: "product_one_pager" };
    case "negative":
    case "unsubscribe":
      // An opt-out is a hard refusal in the backend classifier; never nurture it.
      return { status: "Do Not Contact", notify_human: true, unsubscribe: true };
    case "no_response":
      // Three outreach emails with no reply: retire to Cold with a 60-day retarget.
      return { status: "Cold", retarget_days: 60 };
    case "auto_reply":
      // An automated out-of-office reply is not interest from the creator.
      return { status: "Cold", retarget_days: 60 };
    default:
      return { status: "Needs Human Review", notify_human: true };
  }
}
