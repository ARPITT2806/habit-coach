import Link from "next/link";

type Props = {
  href: string;
  label: string;
  current?: boolean;
};

export function NavItem({ href, label, current }: Props) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`flex flex-1 flex-col items-center justify-center rounded-full px-3 py-2 text-sm tracking-wide transition ${
        current
          ? "bg-ink text-paper"
          : "text-muted hover:bg-sand hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}
