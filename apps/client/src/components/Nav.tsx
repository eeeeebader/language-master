import { BookOpenText, Cards, House, MagnifyingGlass, Path } from "@phosphor-icons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { t } from "@/lib/i18n";
import { OPEN_LECTURE_KEY } from "@/lib/lectures";
import { cx } from "./ui";

const ITEMS = [
  { to: "/", label: t("nav.home"), Icon: House },
  { to: "/stories", label: t("nav.stories"), Icon: BookOpenText },
  { to: "/karteikarten", label: t("nav.cards"), Icon: Cards },
  { to: "/lectures", label: t("nav.lectures"), Icon: Path },
  { to: "/dictionary", label: t("nav.dictionary"), Icon: MagnifyingGlass },
] as const;

export function Nav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg justify-around">
        {ITEMS.map(({ to, label, Icon }) => {
          const active = to === "/" ? path === "/" : path.startsWith(to);
          const open = to === "/lectures" ? sessionStorage.getItem(OPEN_LECTURE_KEY) : null;
          return (
            <Link
              key={to}
              to={open ? "/lectures/$slug" : to}
              params={open ? { slug: open } : undefined}
              className={cx(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                active ? "text-ink" : "text-ink-3",
              )}
            >
              <Icon size={24} weight={active ? "fill" : "regular"} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
