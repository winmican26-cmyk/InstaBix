import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Mail, ShieldAlert, Users } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orgs, users } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth/session";
import { resolveInvite } from "@/lib/invites";
import { ROLE_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { Mark } from "@/components/brand/wordmark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { acceptInviteAction } from "./actions";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Workspace invitation" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await resolveInvite(token);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6 flex items-center gap-2.5">
        <Mark className="size-8" />
        <span className="leading-none">
          <span className="block font-display text-[16px] font-semibold tracking-[-0.03em] text-fg">InstaBix</span>
          <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-faint">Workspace invitation</span>
        </span>
      </div>

      {!invite ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-amber" strokeWidth={1.75} aria-hidden />
                This invitation is not valid
              </CardTitle>
              <CardDescription>It may have expired, been revoked, or already been used.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-[12.5px] leading-6 text-muted">
              Ask an owner of the workspace to send a new invitation. Invitations expire after seven days and can only be
              accepted once.
            </p>
            <Button asChild variant="secondary">
              <Link href="/login">Go to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      ) : invite.acceptedAt ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>This invitation was already used</CardTitle>
              <CardDescription>Accepted on {formatDate(invite.acceptedAt)}.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/login">Sign in to the workspace</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <InviteBody
          token={token}
          orgId={invite.orgId}
          email={invite.email}
          role={invite.role}
          expiresAt={invite.expiresAt}
        />
      )}
    </div>
  );
}

async function InviteBody({
  token,
  orgId,
  email,
  role,
  expiresAt,
}: {
  token: string;
  orgId: string;
  email: string;
  role: string;
  expiresAt: Date;
}) {
  const [org] = await db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, orgId)).limit(1);
  const [existingUser] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, email)).limit(1);
  const session = await getSessionUser();
  const signedInAsInvitee = Boolean(session && existingUser && session.user.id === existingUser.id);
  const signedInAsSomeoneElse = Boolean(session && !signedInAsInvitee);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Join {org?.name ?? "this workspace"}</CardTitle>
          <CardDescription>You were invited as {ROLE_LABEL[role] ?? role}.</CardDescription>
        </div>
        <Badge tone="lime">
          <Users className="size-3" /> {ROLE_LABEL[role] ?? role}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 rounded-lg border border-line bg-surface-2/40 p-3 text-[12px]">
          <p className="flex items-center gap-2 text-fg">
            <Mail className="size-3.5 text-faint" aria-hidden /> {email}
          </p>
          <p className="flex items-center gap-2 text-muted">
            <CalendarClock className="size-3.5 text-faint" aria-hidden /> Expires {formatDate(expiresAt)}
          </p>
        </div>

        {signedInAsSomeoneElse ? (
          <Alert tone="warning" title="You are signed in as someone else">
            Sign out first, then open this link again. This invitation belongs to {email}.
          </Alert>
        ) : null}

        <AcceptForm action={acceptInviteAction.bind(null, token)} needsName={!existingUser} email={email} />

        <p className="text-[11px] leading-5 text-faint">
          {existingUser
            ? `An account already exists for ${email}. Enter its password to join this workspace.`
            : "Creating an account uses this invited address. It cannot be changed on this screen."}
        </p>
      </CardContent>
    </Card>
  );
}
