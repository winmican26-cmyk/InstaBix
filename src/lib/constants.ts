export const APP_NAME = "VistaBix";
export const APP_TAGLINE = "The creator partnership engine";

export type NavItem = { href: string; label: string; icon: string; badge?: "approvals" };

export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
      { href: "/creators", label: "Creators", icon: "Users" },
      { href: "/outreach", label: "Outreach", icon: "Send" },
    ],
  },
  {
    label: "Build",
    items: [
      { href: "/studio", label: "Product Studio", icon: "BookOpen" },
      { href: "/revenue", label: "Revenue", icon: "CircleDollarSign" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/integrations", label: "Integrations", icon: "Plug" },
      { href: "/audit", label: "Audit log", icon: "ScrollText" },
      { href: "/settings", label: "Settings", icon: "Settings" },
    ],
  },
];

export const CREATOR_STATUS_LABEL: Record<string, string> = {
  new: "New",
  reviewing: "Reviewing",
  qualified: "Qualified",
  approved: "Approved",
  contacted: "Contacted",
  negotiating: "Negotiating",
  partnered: "Partnered",
  declined: "Declined",
  suppressed: "Suppressed",
};

export const CREATOR_STATUS_TONE: Record<string, string> = {
  new: "text-muted border-line bg-surface-2",
  reviewing: "text-amber border-amber/30 bg-amber/10",
  qualified: "text-info border-info/30 bg-info/10",
  approved: "text-lime border-lime/30 bg-lime/10",
  contacted: "text-violet border-violet/30 bg-violet/10",
  negotiating: "text-amber border-amber/30 bg-amber/10",
  partnered: "text-lime border-lime/40 bg-lime/15",
  declined: "text-faint border-line bg-surface-2",
  suppressed: "text-danger border-danger/30 bg-danger/10",
};

export const SOURCE_LABEL: Record<string, string> = {
  applied: "Applied",
  invited: "Invited",
  manual: "Added by you",
  discovery: "Discovered",
};

export const CONSENT_LABEL: Record<string, string> = {
  pending: "Consent pending",
  granted: "Consent granted",
  revoked: "Consent revoked",
};

export const PRODUCT_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  outline_pending: "Outline in review",
  outline_approved: "Outline approved",
  generating: "Generating",
  review: "Creator review",
  approved: "Approved",
  published: "Published",
  paused: "Paused",
};

export const MESSAGE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  needs_approval: "Needs approval",
  approved: "Approved",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  replied: "Replied",
  bounced: "Bounced",
  complained: "Complained",
  failed: "Failed",
  canceled: "Canceled",
};

export const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  operator: "Operator",
  reviewer: "Reviewer",
  creator: "Creator",
};

export const PROVIDERS = {
  instagram: {
    name: "Instagram",
    description: "Connect a professional account to read your own insights and enrich public creator metrics through Business Discovery.",
    docs: "https://developers.facebook.com/docs/instagram-platform",
    limitations: "Comments, emails and demographics of other accounts are not available through Meta's APIs.",
  },
  resend: {
    name: "Email · Resend",
    description: "Approved, rate-limited outreach with one-click unsubscribe and inbound reply threading.",
    docs: "https://resend.com/docs",
    limitations: "Sending requires a verified domain with SPF, DKIM and DMARC.",
  },
  stripe: {
    name: "Payments · Stripe",
    description: "Stripe Connect handles creator onboarding, checkout, refunds and payouts. The split ledger stays in VistaBix.",
    docs: "https://docs.stripe.com/connect",
    limitations: "Creators must complete Stripe onboarding before they can be paid.",
  },
  ai: {
    name: "AI · OpenAI / Anthropic",
    description: "OpenAI first, with Anthropic as a configured fallback for product studio and creator analysis.",
    docs: "https://platform.openai.com/docs",
    limitations: "A configured API key does not verify connectivity. Generation is human-gated and never publishes automatically.",
  },
} as const;

export const DEFAULT_SPLIT = { creator: 6000, operator: 4000 } as const;
export const SCORE_MODEL_VERSION = "ibx-score-v2";
export const MIN_MEDIA_FOR_SCORE = 8;
