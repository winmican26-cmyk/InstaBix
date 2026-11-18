import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { getMemberships, requireWorkspace } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { user, org, role } = await requireWorkspace();
  const memberships = await getMemberships(user.id);
  const orgs = memberships.map((m) => ({ id: m.org.id, name: m.org.name, role: m.role }));

  return (
    <div className="app-canvas min-h-dvh">
      <Sidebar orgName={org.name} role={role} />
      <div className="lg:pl-[248px]">
        <Topbar
          orgs={orgs}
          activeOrgId={org.id}
          orgName={org.name}
          role={role}
          user={{ name: user.name, email: user.email }}
        />
        <main id="main" className="mx-auto w-full max-w-[1360px] px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}
