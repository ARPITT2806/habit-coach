"use client";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative mx-auto min-h-screen max-w-lg px-6 py-8">
      <div className="relative z-10">{children}</div>
    </main>
  );
}