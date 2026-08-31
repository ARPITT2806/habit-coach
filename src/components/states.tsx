export function EmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-3xl border border-line bg-paper px-5 py-8 text-center">
      <p className="font-serif text-xl text-ink">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
    </div>
  );
}

export function ErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
      {message}
    </p>
  );
}
