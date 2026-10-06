import { useEffect, useRef, useState } from "react";
import { ArrowRightBold, List, X } from "../components/icons/PublicIcons";
import { Lockup } from "../components/brand/Logo";
import { cls } from "../lib/cls";

/** Where "Escríbenos" leads. No address is registered yet, so the deployment provides it. */
const CONTACT_HREF = (import.meta.env.VITE_CONTACT_URL as string | undefined) ?? "mailto:";

const SECTIONS = [
  ["#unidades", "Unidades"],
  ["#modulos", "Módulos"],
  ["#precios", "Precios"],
  ["#preguntas", "Preguntas"],
  ["#historia", "Historia"],
];

/** The width from which the sections fit in the bar; below it they live in the menu. */
const WIDE = "(min-width: 768px)";

export function ContactButton({ className }: { className?: string }) {
  return (
    <a href={CONTACT_HREF} className={cls("btn-primary whitespace-nowrap", className)}>
      Escríbenos
      <ArrowRightBold size={16} aria-hidden="true" />
    </a>
  );
}

/**
 * The page's bar. On a phone the sections do not fit beside the lockup, so they open from a
 * menu button; the panel is CSS only, like the rest of what the first screen needs.
 */
export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const read = () => setScrolled(window.scrollY > 8);
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    }
    // A phone turned on its side can become wide enough for the bar: the menu has no place there.
    const wide = typeof window.matchMedia === "function" ? window.matchMedia(WIDE) : null;
    const onWide = () => setOpen(false);
    document.addEventListener("keydown", onKeyDown);
    wide?.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      wide?.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <header
      className={cls(
        "sticky top-0 z-shell border-b border-line-subtle bg-canvas transition-shadow duration-300",
        (scrolled || open) && "shadow-raised",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 md:gap-6 lg:px-8">
        <a href="#inicio" className="text-ink" onClick={() => setOpen(false)}>
          <Lockup tone="auto" className="w-32 sm:w-36" />
        </a>
        <nav aria-label="Secciones" className="hidden items-center gap-6 md:flex lg:gap-8">
          {SECTIONS.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="text-sm font-medium text-muted transition-colors hover:text-ink"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a href="/login" className="btn-ghost hidden whitespace-nowrap lg:inline-flex">
            Iniciar sesión
          </a>
          <ContactButton />
          <button
            ref={toggle}
            type="button"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
            aria-controls="menu-secciones"
            onClick={() => setOpen((value) => !value)}
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink transition-colors hover:bg-sunken md:hidden"
          >
            {open ? <X size={22} aria-hidden="true" /> : <List size={22} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Hidden with `visibility`, which also takes its links out of the tab order. */}
      <div
        id="menu-secciones"
        className={cls(
          "absolute inset-x-0 top-full border-b border-line-subtle bg-canvas shadow-overlay md:hidden",
          "transition-[opacity,translate,visibility] duration-200 ease-out motion-reduce:transition-none",
          open ? "visible opacity-100" : "invisible -translate-y-2 opacity-0",
        )}
      >
        <nav aria-label="Menú" className="mx-auto flex max-w-7xl flex-col px-4 py-3 sm:px-6">
          {SECTIONS.map(([href, label]) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex h-12 items-center border-b border-line-subtle font-display text-xl text-ink"
            >
              {label}
            </a>
          ))}
          <a href="/login" className="btn-secondary mt-4 justify-center py-2.5">
            Iniciar sesión
          </a>
        </nav>
      </div>
    </header>
  );
}
