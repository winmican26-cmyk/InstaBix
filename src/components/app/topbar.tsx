import { Breadcrumbs } from "@/components/app/breadcrumbs";
import { CommandPalette } from "@/components/app/command-palette";
import { MobileNav } from "@/components/app/mobile-nav";
import { OrgSwitcher } from "@/components/app/org-switcher";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { UserMenu } from "@/components/app/user-menu";

type OrgOption = { id: string; name: string; role: string };

export function Topbar({
  orgs,
  activeOrgId,
  orgName,
  role,
  user,
}: {
  orgs: OrgOption[];
  activeOrgId: string;
  orgName: string;
  role: string;
  user: { name: string; email: string };
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
        <MobileNav orgName={orgName} role={role} />
        <Breadcrumbs />
        <div className="ml-auto flex items-center gap-1.5">
          <CommandPalette />
          <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden />
          <OrgSwitcher orgs={orgs} activeOrgId={activeOrgId} />
          <ThemeToggle />
          <UserMenu name={user.name} email={user.email} role={role} />
        </div>
      </div>
    </header>
  );
}
