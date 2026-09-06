"use client";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative mx-auto min-h-screen max-w-lg px-6 py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-[-120px] z-0 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
      />
      <div className="relative z-10">{children}</div>
    </main>
  );
}