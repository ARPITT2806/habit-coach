import type { ReactNode } from "react";

export function EmptyState({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          {icon}
        </div>
      ) : null}
      <p className="font-serif text-xl text-ink">{title}</p>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted">{body}</p>
    </div>
  );
}

export function ErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mt-3 rounded-2xl bg-rose-soft px-4 py-3 text-sm font-medium text-rose"
    >
      {message}
    </p>
  );
}