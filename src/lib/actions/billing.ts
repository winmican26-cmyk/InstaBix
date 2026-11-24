"use server";

import { revalidatePath } from "next/cache";
import { logActionFailure } from "@/lib/action-errors";
import { canManage, canReview, requireWorkspace } from "@/lib/auth/session";
import { getQuotaState, unlockCreator } from "@/lib/billing/quota";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function unlockCreatorAction(
  creatorId: string,
): Promise<{ error?: string; success?: string; remaining?: number }> {
  const workspace = await requireWorkspace();
  if (!workspace) return { error: "Sign in to unlock creators." };
  const { org, user, role } = workspace;

  // Unlocking spends a workspace entitlement: reviewers can review, but only
  // owners/admins may commit a paid-quota decision for the organisation.
  if (!canReview(role) || !canManage(role)) return { error: "You don't have permission to unlock creators." };
  if (typeof creatorId !== "string" || !UUID.test(creatorId)) return { error: "Unknown creator." };

  try {
    const result = await unlockCreator(org.id, user.id, creatorId);
    if (!result.ok) {
      const quota = await getQuotaState(org.id);
      return {
        error: "You've used all 10 free weekly unlocks. Upgrade to VistaBix Pro for unlimited creator discovery.",
        remaining: quota.remaining,
      };
    }

    revalidatePath("/creators");
    revalidatePath(`/creators/${creatorId}`);
    return { success: "Creator unlocked.", remaining: result.remaining };
  } catch (error) {
    logActionFailure("billing.unlock_creator_failed", error);
    return { error: "The unlock could not be recorded. Nothing was charged." };
  }
}
