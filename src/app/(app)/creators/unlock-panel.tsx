import { Lock, Sparkles } from "lucide-react";
import { ActionButton } from "@/components/app/action-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { unlockCreatorAction } from "@/lib/actions/billing";

/**
 * Server-only teaser panel. All quota numbers are derived by the server and
 * passed in by the page; nothing about the plan or the count is client input.
 */
export function UnlockPanel({
  creatorId,
  username,
  remaining,
  limit,
  canManage,
}: {
  creatorId: string;
  username: string;
  remaining: number;
  limit: number;
  canManage: boolean;
}) {
  return (
    <Card className="border-violet/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-4 text-violet" strokeWidth={1.75} aria-hidden />
          Preview only
        </CardTitle>
        <CardDescription>
          This creator is in your workspace, but the full record is still locked.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-[13px] leading-6 text-muted">
          The full profile, public metrics, media, products, messages and agreements are hidden until you unlock this
          creator. Browsing and filtering stay free; one reveal uses one of your weekly unlocks.
        </p>

        {remaining > 0 ? (
          <ActionButton action={unlockCreatorAction.bind(null, creatorId)} variant="secondary" size="sm">
            <Lock /> Unlock @{username} · {remaining} of {limit} free unlocks left this week
          </ActionButton>
        ) : (
          <div className="space-y-3 rounded-lg border border-line bg-surface-2/40 p-4">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-fg">
              <Sparkles className="size-4 text-violet" aria-hidden /> VistaBix Pro — $29 / month
            </p>
            <p className="text-[12px] leading-5 text-muted">
              Upgrade for unlimited creator detail. No charge happens until you confirm checkout.
            </p>
            {canManage ? (
              <form action="/api/billing/checkout" method="post">
                <Button type="submit" size="sm">
                  Upgrade to VistaBix Pro
                </Button>
              </form>
            ) : (
              <p className="text-[12px] text-muted">Ask an owner or admin in your workspace to upgrade.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
