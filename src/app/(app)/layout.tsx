import { redirect } from "next/navigation";
import { logOut } from "@/lib/actions/auth";
import { getSession } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { prisma } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user?.onboardedAt) redirect("/onboarding");

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col px-5 pb-28 pt-8">
      <header className="mb-8 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.22em] text-muted">North</p>
        <form action={logOut}>
          <button type="submit" className="text-sm text-muted underline-offset-4 hover:underline">
            Log out
          </button>
        </form>
      </header>
      <div className="flex-1">{children}</div>
      <AppNav />
    </div>
  );
}
