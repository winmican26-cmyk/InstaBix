import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { withInviteToken } from "@/lib/db";
import { invites } from "@/lib/db/schema";
import { sha256 } from "@/lib/crypto";

export type InviteRow = typeof invites.$inferSelect;

/** Resolves an invitation by its hash. The policy exposes exactly that row. */
export async function resolveInvite(rawToken: string): Promise<InviteRow | null> {
  if (!rawToken || rawToken.length < 20 || rawToken.length > 200) return null;
  const tokenHash = sha256(rawToken);
  return withInviteToken(tokenHash, async (tx) => {
    const [row] = await tx
      .select()
      .from(invites)
      .where(and(eq(invites.tokenHash, tokenHash), gt(invites.expiresAt, new Date())))
      .limit(1);
    return row ?? null;
  });
}
