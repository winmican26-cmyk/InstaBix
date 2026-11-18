import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  Download,
  KeyRound,
  Mail,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { requireWorkspace, canManage } from "@/lib/auth/session";
import { getSettings } from "@/lib/db/queries";
import {
  changePasswordAction,
  inviteMemberAction,
  renameOrgAction,
  revokeInviteAction,
  updateOrgSlugAction,
} from "@/lib/actions/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR, TableShell } from "@/components/ui/table";
import { Avatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/app/action-button";
import { ActionForm } from "@/components/app/action-form";
import { MemberActions } from "./member-actions";
import { formatDate, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  operator: "Operator",
  reviewer: "Reviewer",
  creator: "Creator",
};

export default async function SettingsPage() {
  const { user, org, role } = await requireWorkspace();
  const { members, invites } = await getSettings(org.id);
  const manage = canManage(role);
  const isOwner = role === "owner";

  const pendingInvites = invites.filter((invite) => !invite.acceptedAt && invite.expiresAt > new Date());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Identity, access and data exits. Changes here are audited with the actor and the previous value."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-4 text-lime" strokeWidth={1.75} aria-hidden />
                Workspace identity
              </CardTitle>
              <CardDescription>Shown on invitations, emails and the sidebar.</CardDescription>
            </div>
            <Badge tone="neutral">{ROLE_LABEL[role] ?? role}</Badge>
          </CardHeader>
          <CardContent className="space-y-5">
            <ActionForm action={renameOrgAction} submitLabel="Save name" pendingLabel="Saving…">
              <Field label="Workspace name" htmlFor="name" required>
                <Input id="name" name="name" defaultValue={org.name} maxLength={80} required disabled={!manage} />
              </Field>
            </ActionForm>

            <div className="border-t border-line pt-5">
              <ActionForm action={updateOrgSlugAction} submitLabel="Save address" pendingLabel="Saving…">
                <Field
                  label="Workspace address"
                  htmlFor="slug"
                  hint={isOwner ? "Lowercase letters, numbers and dashes." : "Only the owner can change the address."}
                >
                  <Input
                    id="slug"
                    name="slug"
                    defaultValue={org.slug}
                    maxLength={60}
                    disabled={!isOwner}
                    autoCapitalize="none"
                  />
                </Field>
              </ActionForm>
            </div>
          </CardContent>
          <CardFooter>
            <p className="font-mono text-[10.5px] text-faint">org {org.id.slice(0, 8)} · created {formatDate(org.createdAt)}</p>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-4 text-lime" strokeWidth={1.75} aria-hidden />
                Your account
              </CardTitle>
              <CardDescription>Signed in as {user.email}.</CardDescription>
            </div>
            <Avatar name={user.name} size="sm" />
          </CardHeader>
          <CardContent>
            <ActionForm action={changePasswordAction} submitLabel="Change password" pendingLabel="Changing…">
              <div className="space-y-4">
                <Field label="Current password" htmlFor="current" required>
                  <Input id="current" name="current" type="password" autoComplete="current-password" required />
                </Field>
                <Field label="New password" htmlFor="next" hint="At least 12 characters, with mixed case and a number." required>
                  <Input id="next" name="next" type="password" autoComplete="new-password" required />
                </Field>
              </div>
            </ActionForm>
          </CardContent>
          <CardFooter>
            <p className="flex items-center gap-1.5 text-[11px] text-faint">
              <ShieldCheck className="size-3" aria-hidden /> Passwords are scrypt-hashed; sessions are opaque database rows.
            </p>
          </CardFooter>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-lime" strokeWidth={1.75} aria-hidden />
              Members
            </CardTitle>
            <CardDescription>{members.length} person{members.length === 1 ? "" : "s"} can access this workspace.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <TableShell>
            <Table>
              <THead>
                <TR>
                  <TH>Person</TH>
                  <TH>Role</TH>
                  <TH>Joined</TH>
                  <TH className="text-right">Last sign-in</TH>
                  <TH className="text-right">
                    <span className="sr-only">Actions</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {members.map((member) => (
                  <TR key={member.membershipId}>
                    <TD>
                      <span className="flex items-center gap-2.5">
                        <Avatar name={member.name} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-[12.5px] font-medium text-fg">
                            {member.name}
                            {member.userId === user.id ? <span className="ml-1 text-[10.5px] text-faint">(you)</span> : null}
                          </span>
                          <span className="block truncate text-[11px] text-faint">{member.email}</span>
                        </span>
                      </span>
                    </TD>
                    <TD>
                      {member.role === "owner" ? (
                        <Badge tone="lime">{ROLE_LABEL[member.role]}</Badge>
                      ) : (
                        <span className="text-[12px] text-muted">{ROLE_LABEL[member.role] ?? member.role}</span>
                      )}
                    </TD>
                    <TD className="font-mono text-[11px] text-faint">{formatDate(member.joinedAt)}</TD>
                    <TD className="text-right font-mono text-[11px] text-faint">
                      {member.lastLoginAt ? timeAgo(member.lastLoginAt) : "never"}
                    </TD>
                    <TD className="text-right">
                      {manage ? (
                        <MemberActions
                          memberId={member.membershipId}
                          role={member.role}
                          isOwner={member.role === "owner"}
                          isSelf={member.userId === user.id}
                        />
                      ) : (
                        <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint">read only</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableShell>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="size-4 text-lime" strokeWidth={1.75} aria-hidden />
                Invite someone
              </CardTitle>
              <CardDescription>
                Invitations are single-use, hashed at rest and expire after seven days.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {manage ? (
              <ActionForm action={inviteMemberAction} submitLabel="Create invitation" pendingLabel="Creating…">
                <div className="space-y-4">
                  <Field label="Email" htmlFor="email" required>
                    <Input id="email" name="email" type="email" placeholder="teammate@example.com" required />
                  </Field>
                  <Field label="Role" htmlFor="role" hint="Reviewers can qualify creators and approve messages, but cannot manage billing." required>
                    <Select id="role" name="role" defaultValue="operator">
                      <option value="admin">Admin — manage people and settings</option>
                      <option value="operator">Operator — run the pipeline</option>
                      <option value="reviewer">Reviewer — approve drafts and products</option>
                    </Select>
                  </Field>
                </div>
              </ActionForm>
            ) : (
              <Alert tone="info" title="You cannot invite people">
                Only owners and admins can create invitations in this workspace.
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="size-4 text-lime" strokeWidth={1.75} aria-hidden />
                Open invitations
              </CardTitle>
              <CardDescription>
                {pendingInvites.length === 0 ? "Nothing outstanding." : `${pendingInvites.length} awaiting acceptance.`}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {pendingInvites.length === 0 ? (
              <EmptyState
                icon={Mail}
                title="No open invitations"
                description="Anything you create appears here with its expiry so it cannot linger unnoticed."
              />
            ) : (
              <ul className="divide-y divide-line/70">
                {pendingInvites.map((invite) => (
                  <li key={invite.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-fg">{invite.email}</span>
                      <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
                        {invite.role} · expires {formatDate(invite.expiresAt)}
                      </span>
                    </span>
                    {manage ? (
                      <ActionButton
                        action={revokeInviteAction.bind(null, invite.id)}
                        variant="ghost"
                        size="sm"
                        confirm={`Revoke the invitation for ${invite.email}?`}
                      >
                        Revoke
                      </ActionButton>
                    ) : (
                      <Badge tone="amber">pending</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Download className="size-4 text-lime" strokeWidth={1.75} aria-hidden />
              Data export
            </CardTitle>
            <CardDescription>
              Portability is a real endpoint, not a marketing claim. The export is generated from your workspace rows.
            </CardDescription>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link href="/api/export">
              <Download /> Export workspace JSON
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-[12px] leading-5 text-muted">
            The export includes creators, products, orders, ledger entries and audit events for{" "}
            <span className="font-medium text-fg">{org.name}</span>. Access tokens, password hashes and other people&apos;s
            sessions are never included. Every export is written to the audit log.
          </p>
        </CardContent>
        <CardFooter>
          <p className="text-[11px] text-faint">
            Prefer SQL? Every row carries <span className="font-mono">org_id</span> and is protected by row-level security.
          </p>
        </CardFooter>
      </Card>

      <p className="text-[11px] leading-5 text-faint">
        Deleting the workspace is intentionally not a button here. It requires a written request and a verified owner
        identity, exactly like the privacy policy says.
      </p>
    </div>
  );
}
