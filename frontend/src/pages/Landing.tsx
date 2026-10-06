import { useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import {
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  m,
  useReducedMotion,
  useScroll,
  useSpring,
} from "motion/react";
// One module per icon: the package's index holds every glyph, and the dev server would bundle
// all of them.
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { BedIcon as Bed } from "@phosphor-icons/react/dist/csr/Bed";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { CalendarCheckIcon as CalendarCheck } from "@phosphor-icons/react/dist/csr/CalendarCheck";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/dist/csr/ChartBar";
import { ClipboardTextIcon as ClipboardText } from "@phosphor-icons/react/dist/csr/ClipboardText";
import { FileTextIcon as FileText } from "@phosphor-icons/react/dist/csr/FileText";
import { KanbanIcon as Kanban } from "@phosphor-icons/react/dist/csr/Kanban";
import { NotepadIcon as Notepad } from "@phosphor-icons/react/dist/csr/Notepad";
import { PackageIcon as Package } from "@phosphor-icons/react/dist/csr/Package";
import { ReceiptIcon as Receipt } from "@phosphor-icons/react/dist/csr/Receipt";
import { ScissorsIcon as Scissors } from "@phosphor-icons/react/dist/csr/Scissors";
import { SignInIcon as SignIn } from "@phosphor-icons/react/dist/csr/SignIn";
import { SquaresFourIcon as SquaresFour } from "@phosphor-icons/react/dist/csr/SquaresFour";
import { VanIcon as Van } from "@phosphor-icons/react/dist/csr/Van";
import { WalletIcon as Wallet } from "@phosphor-icons/react/dist/csr/Wallet";
import type { Icon } from "@phosphor-icons/react";
import { Lockup } from "../components/brand/Logo";
import { Meander } from "../components/brand/Meander";
import { cls } from "../lib/cls";
import marbleUrl from "../assets/landing/marble.webp";

/**
 * The public product page (BRAND.md is the source for its copy, colours and type).
 *
 * It claims only what has shipped: no prices, customer figures, testimonials, electronic
 * invoicing or automatic reminders. The product views are screenshots of the seeded dev stack
 * under `src/assets/landing/`, not mock-ups.
 *
 * Icons here are Phosphor; the application itself still uses Lucide.
 *
 * `main.tsx` mounts this page on its own, outside the application's router and session, so it
 * links to the application with plain anchors.
 */

/** Where "Escríbenos" leads. No address is registered yet, so the deployment provides it. */
const CONTACT_HREF = (import.meta.env.VITE_CONTACT_URL as string | undefined) ?? "mailto:";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Motion's animation engine arrives in its own chunk, after the page has painted. Until then an
 * `m` element simply holds its initial style, which is why nothing above the fold depends on it.
 */
const loadMotionFeatures = () => import("./LandingMotion").then((module) => module.default);

/**
 * Each screenshot is stored at four widths, as `<name>-<width>.webp`, so a phone does not
 * download the desktop image. Imported rather than served from `public/` so the build hashes
 * them and they cache like the rest of `/assets/`.
 */
const SHOT_WIDTHS = [640, 960, 1440, 2160];
const SHOT_URLS = import.meta.glob<string>("../assets/landing/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

function shotSources(name: string) {
  const url = (width: number) => SHOT_URLS[`../assets/landing/${name}-${width}.webp`];
  return {
    src: url(1440),
    srcSet: SHOT_WIDTHS.map((width) => `${url(width)} ${width}w`).join(", "),
  };
}

/**
 * The dark palette, derived from the shell tokens in BRAND.md (Tinta, its ink and its muted
 * text). Scoped to this page: the application has no dark canvas of its own.
 *
 * The hero's entrance is here too, in CSS, so the first screen does not wait for Motion.
 *
 * The marble is one seamless tile of veins stored as transparency and used as a mask over the
 * ink colour, so the same file veins the light canvas dark and the dark canvas light. It lies
 * on the canvas only: the sunken bands and the surfaces stay flat.
 */
const PAGE_STYLES = `
.landing {
  position: relative;
  isolation: isolate;
}
.landing::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: var(--color-ink);
  opacity: 0.11;
  -webkit-mask: url(${marbleUrl}) top center / 1400px repeat;
  mask: url(${marbleUrl}) top center / 1400px repeat;
}
@media (prefers-color-scheme: dark) {
  .landing {
    color-scheme: dark;
    --color-canvas: #1c1917;
    --color-surface: color-mix(in srgb, #fafaf9 5%, #1c1917);
    --color-raised: color-mix(in srgb, #fafaf9 5%, #1c1917);
    --color-sunken: color-mix(in srgb, #fafaf9 9%, #1c1917);
    --color-ink: #fafaf9;
    --color-muted: #a8a29e;
    --color-border: color-mix(in srgb, #fafaf9 24%, #1c1917);
    --color-border-subtle: color-mix(in srgb, #fafaf9 13%, #1c1917);
  }
}
@keyframes landing-rise {
  from { opacity: 0; transform: translateY(16px); }
}
@media (prefers-reduced-motion: no-preference) {
  .landing-rise {
    animation: landing-rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(var(--rise-order) * 90ms);
  }
}`;

type UnitId = "guarderia" | "peluqueria" | "veterinaria";

interface Unit {
  id: UnitId;
  name: string;
  blurb: string;
  features: { Icon: Icon; label: string }[];
  shot: string;
  shotAlt: string;
  /** One unit colour at a time (the One Unit Rule); text starts at 700 on the light tint. */
  tab: string;
  panel: string;
  heading: string;
  body: string;
}

const UNITS: Unit[] = [
  {
    id: "guarderia",
    name: "Argos Guardería",
    blurb:
      "Admite solo cuando hay cupo. Cada sala muestra su ocupación al momento y cada estancia se cierra con su cobro.",
    features: [
      { Icon: SquaresFour, label: "Cupos por sala en vivo" },
      { Icon: SignIn, label: "Entradas y salidas con control de aforo" },
      { Icon: ArrowsClockwise, label: "Planes recurrentes" },
      { Icon: Van, label: "Rutas de transporte del día" },
    ],
    shot: "guarderia",
    shotAlt: "Pantalla de control de guardería con la ocupación de cada sala",
    tab: "bg-daycare-700",
    panel: "bg-daycare-50 border-daycare-200 dark:bg-daycare-900 dark:border-daycare-800",
    heading: "text-daycare-900 dark:text-daycare-50",
    body: "text-daycare-800 dark:text-daycare-100",
  },
  {
    id: "peluqueria",
    name: "Argos Peluquería",
    blurb:
      "Cada cita lleva su servicio, su duración y su precio. El tablero muestra en qué paso va cada mascota hasta la entrega.",
    features: [
      { Icon: Scissors, label: "Catálogo de servicios" },
      { Icon: CalendarBlank, label: "Agenda por franja horaria" },
      { Icon: Kanban, label: "Tablero de flujo de atención" },
      { Icon: Receipt, label: "Cobro directo en la entrega" },
    ],
    shot: "peluqueria",
    shotAlt: "Agenda de peluquería con el tablero de flujo de atención",
    tab: "bg-grooming-700",
    panel: "bg-grooming-50 border-grooming-200 dark:bg-grooming-900 dark:border-grooming-800",
    heading: "text-grooming-900 dark:text-grooming-50",
    body: "text-grooming-800 dark:text-grooming-100",
  },
  {
    id: "veterinaria",
    name: "Argos Veterinaria",
    blurb:
      "Administra la clínica como negocio: de la agenda y la ficha clínica a la farmacia y la cuenta, con sus libros aparte.",
    features: [
      { Icon: CalendarCheck, label: "Agenda y sala de espera" },
      { Icon: ClipboardText, label: "Ficha clínica e historial" },
      { Icon: Notepad, label: "Recetas y farmacia" },
      { Icon: Bed, label: "Hospitalización con hoja de tratamiento" },
    ],
    shot: "veterinaria",
    shotAlt: "Pacientes de la clínica veterinaria con el acceso a cada historia clínica",
    tab: "bg-veterinary-700",
    panel:
      "bg-veterinary-50 border-veterinary-200 dark:bg-veterinary-900 dark:border-veterinary-800",
    heading: "text-veterinary-900 dark:text-veterinary-50",
    body: "text-veterinary-800 dark:text-veterinary-100",
  },
];

const RECORD_STOPS = [
  {
    place: "En la consulta",
    line: "La visita, las vacunas y los preventivos quedan anotados en su ficha.",
  },
  {
    place: "En la peluquería",
    line: "El equipo abre la misma ficha, con sus alertas, sus vacunas y sus fotos.",
  },
  {
    place: "En la guardería",
    line: "Al ingresar ya están su tutor, sus vacunas y sus estancias anteriores.",
  },
];

/** A product screenshot in the card shape, with its box reserved so nothing shifts on load. */
function Shot({
  name,
  alt,
  sizes,
  eager = false,
  className,
}: {
  name: string;
  alt: string;
  /** The width the image is laid out at, so the browser can pick a file before layout. */
  sizes: string;
  eager?: boolean;
  className?: string;
}) {
  return (
    <img
      {...shotSources(name)}
      sizes={sizes}
      alt={alt}
      width={1440}
      height={900}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      // Lower case on purpose: React 18 does not know the camel-cased prop.
      {...(eager ? { fetchpriority: "high" } : {})}
      className={cls(
        "block w-full h-auto rounded-xl border border-line-subtle bg-surface shadow-raised",
        className,
      )}
    />
  );
}

/** Content arrives once as its section enters the viewport, so the page reads in order. */
function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </m.div>
  );
}

function ContactButton({ className }: { className?: string }) {
  return (
    <a href={CONTACT_HREF} className={cls("btn-primary whitespace-nowrap", className)}>
      Escríbenos
      <ArrowRight size={16} weight="bold" aria-hidden="true" />
    </a>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-shell border-b border-line-subtle bg-canvas">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <a href="#inicio" className="text-ink">
          <Lockup tone="auto" className="w-36" />
        </a>
        <nav aria-label="Secciones" className="hidden items-center gap-8 md:flex">
          {[
            ["#unidades", "Unidades"],
            ["#modulos", "Módulos"],
            ["#historia", "Historia"],
          ].map(([href, label]) => (
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
          <a href="/login" className="btn-ghost hidden whitespace-nowrap sm:inline-flex">
            Iniciar sesión
          </a>
          <ContactButton />
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const rise = (order: number) => ({ "--rise-order": order }) as CSSProperties;
  return (
    <section
      id="inicio"
      className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 md:pt-14 lg:px-8 lg:pb-24"
    >
      <p
        style={rise(0)}
        className="landing-rise text-xs font-semibold uppercase tracking-[0.05em] text-muted"
      >
        Gestión de guarderías, peluquerías y veterinarias
      </p>
      <h1
        style={rise(1)}
        className="landing-rise mt-4 max-w-5xl font-display text-4xl leading-[1.1] text-ink md:text-5xl lg:text-6xl"
      >
        Cuidamos tu negocio, para que tú cuides de ellos.
      </h1>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:mt-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-12">
        <div style={rise(2)} className="landing-rise">
          <p className="max-w-[40ch] text-base leading-relaxed text-muted">
            Reservas, cupos, citas, fichas clínicas, cobros e inventario en un solo lugar, con las
            cuentas de cada unidad por separado.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ContactButton />
            <a href="#unidades" className="btn-secondary whitespace-nowrap">
              Conoce las unidades
            </a>
          </div>
        </div>
        <div style={rise(3)} className="landing-rise">
          <Shot
            eager
            name="panel"
            sizes="(min-width: 1024px) min(62vw, 780px), 100vw"
            alt="Panel de inicio de Argos Suite con el resumen del día"
          />
        </div>
      </div>
    </section>
  );
}

function Units() {
  const [activeId, setActiveId] = useState<UnitId>("guarderia");
  const tabRefs = useRef<Partial<Record<UnitId, HTMLButtonElement | null>>>({});
  const active = UNITS.find((unit) => unit.id === activeId) ?? UNITS[0];

  /** Arrow keys move between tabs, as the tablist pattern expects. */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = UNITS.findIndex((unit) => unit.id === activeId);
    const next = UNITS[(index + step + UNITS.length) % UNITS.length];
    setActiveId(next.id);
    tabRefs.current[next.id]?.focus();
  }

  return (
    <section id="unidades" className="scroll-mt-16 border-t border-line-subtle">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <Reveal>
          <h2 className="font-display text-3xl leading-[1.15] text-ink md:text-4xl">
            Tres unidades, cada una con sus cuentas
          </h2>
          <p className="mt-3 max-w-[60ch] leading-relaxed text-muted">
            Guardería, peluquería y veterinaria comparten tutores y mascotas. Los ingresos de cada
            una se registran por separado.
          </p>
        </Reveal>

        <div
          role="tablist"
          aria-label="Unidades de negocio"
          onKeyDown={onKeyDown}
          className="mt-8 flex flex-wrap gap-2"
        >
          {UNITS.map((unit) => {
            const selected = unit.id === activeId;
            return (
              <button
                key={unit.id}
                ref={(node) => {
                  tabRefs.current[unit.id] = node;
                }}
                type="button"
                role="tab"
                id={`tab-${unit.id}`}
                aria-selected={selected}
                aria-controls="panel-unidad"
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveId(unit.id)}
                className={cls(
                  "relative rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                  selected ? "text-white" : "text-muted hover:bg-sunken hover:text-ink",
                )}
              >
                {selected && (
                  <m.span
                    layoutId="unit-tab"
                    className={cls("absolute inset-0 rounded-lg", unit.tab)}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative">{unit.name}</span>
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id="panel-unidad"
          aria-labelledby={`tab-${active.id}`}
          className={cls(
            "mt-4 rounded-xl border p-5 transition-colors duration-300 sm:p-8",
            active.panel,
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={active.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28, ease: EASE }}
            >
              <p
                className={cls(
                  "max-w-[52ch] font-display text-xl leading-snug md:text-2xl",
                  active.heading,
                )}
              >
                {active.blurb}
              </p>
              <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                {active.features.map(({ Icon, label }) => (
                  <li key={label} className={cls("flex items-start gap-2.5 text-sm", active.body)}>
                    <Icon size={20} className="mt-px shrink-0" aria-hidden="true" />
                    <span className="font-medium leading-snug">{label}</span>
                  </li>
                ))}
              </ul>
              <Shot
                name={active.shot}
                alt={active.shotAlt}
                sizes="(min-width: 1280px) 1150px, 90vw"
                className="mt-8"
              />
            </m.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

function OneRecord() {
  const reduce = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: track,
    offset: ["start 0.85", "start 0.4"],
  });
  // The line draws from the clinic to the daycare as the reader arrives: the record travelling.
  const drawn = useSpring(scrollYProgress, { stiffness: 120, damping: 28 });

  return (
    <section className="border-t border-line-subtle bg-sunken">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <Reveal>
          <h2 className="max-w-3xl font-display text-3xl leading-[1.15] text-ink md:text-5xl md:leading-[1.1]">
            Una sola ficha para cada mascota
          </h2>
        </Reveal>

        <div ref={track} className="relative mt-12">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 hidden h-px md:block">
            <m.div className="h-px origin-left bg-ink" style={{ scaleX: reduce ? 1 : drawn }} />
          </div>
          <ol className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-10">
            {RECORD_STOPS.map((stop, index) => (
              <li key={stop.place} className="md:pt-6">
                <Reveal delay={index * 0.12}>
                  <h3 className="font-display text-2xl leading-tight text-ink">{stop.place}</h3>
                  <p className="mt-2 max-w-[36ch] leading-relaxed text-muted">{stop.line}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function ModuleText({ Icon, name, line }: { Icon: Icon; name: string; line: string }) {
  return (
    <div>
      <Icon size={24} className="text-ink" aria-hidden="true" />
      <h3 className="mt-3 font-display text-2xl leading-tight text-ink">{name}</h3>
      <p className="mt-2 max-w-[44ch] text-sm leading-relaxed text-muted">{line}</p>
    </div>
  );
}

function Modules() {
  const tile = "overflow-hidden rounded-xl border border-line-subtle";
  return (
    <section id="modulos" className="scroll-mt-16 border-t border-line-subtle">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <Reveal>
          <h2 className="font-display text-3xl leading-[1.15] text-ink md:text-4xl">
            Contratas solo los módulos que usas
          </h2>
          <p className="mt-3 max-w-[60ch] leading-relaxed text-muted">
            Todas las cuentas incluyen el núcleo: tutores, mascotas y tu equipo. El resto se activa
            cuando lo necesitas.
          </p>
        </Reveal>

        {/* Four modules, four cells: 4 + 2 over 2 + 4 on desktop, one column on a phone. */}
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-6">
          <Reveal className={cls(tile, "bg-surface md:col-span-4")}>
            <div className="p-6 sm:p-8">
              <ModuleText
                Icon={Wallet}
                name="Argos Finanzas"
                line="Cobros, cuentas por pagar y proveedores, con las cuentas de cada unidad por separado."
              />
            </div>
            <div className="pl-6 sm:pl-8">
              <img
                {...shotSources("finanzas")}
                sizes="(min-width: 768px) min(62vw, 775px), 100vw"
                alt="Pantalla de gestión financiera con los cobros del periodo"
                width={1440}
                height={900}
                loading="lazy"
                decoding="async"
                className="block h-56 w-full rounded-tl-xl border-l border-t border-line-subtle object-cover object-left-top"
              />
            </div>
          </Reveal>

          <Reveal delay={0.08} className={cls(tile, "bg-sunken p-6 sm:p-8 md:col-span-2")}>
            <ModuleText
              Icon={Package}
              name="Argos Inventario"
              line="Artículos, movimientos de entrada y salida, y un aviso cuando el stock llega al mínimo."
            />
          </Reveal>

          <Reveal
            className={cls(
              tile,
              "flex flex-col justify-between gap-10 bg-sunken p-6 sm:p-8 md:col-span-2",
            )}
          >
            <ModuleText
              Icon={FileText}
              name="Argos Contratos"
              line="Contratos de estancia por tutor y mascota, junto a las alertas operativas y sanitarias."
            />
            <div className="text-action dark:text-oro">
              <Meander />
            </div>
          </Reveal>

          <Reveal delay={0.08} className={cls(tile, "bg-surface md:col-span-4")}>
            <div className="p-6 sm:p-8">
              <ModuleText
                Icon={ChartBar}
                name="Argos Informes"
                line="Informes y gráficos del periodo, con exportación a Excel."
              />
            </div>
            <div className="pl-6 sm:pl-8">
              <img
                {...shotSources("informes")}
                sizes="(min-width: 768px) min(62vw, 775px), 100vw"
                alt="Pantalla de informes con los gráficos del periodo"
                width={1440}
                height={900}
                loading="lazy"
                decoding="async"
                className="block h-56 w-full rounded-tl-xl border-l border-t border-line-subtle object-cover object-left-top"
              />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Story() {
  return (
    <section id="historia" className="scroll-mt-16 border-t border-line-subtle">
      <Reveal className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:py-24">
        <div className="mx-auto w-40 text-action dark:text-oro">
          <Meander />
        </div>
        <h2 className="mt-8 font-display text-3xl leading-[1.15] text-ink md:text-4xl">
          El perro que esperó veinte años
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-muted">
          Argos, el perro de Odiseo, lo esperó veinte años y fue el único que lo reconoció al volver
          a casa. Argos Suite lleva su nombre porque guarda cada registro con esa misma fidelidad,
          para que tú dediques tu tiempo a las mascotas.
        </p>
      </Reveal>
    </section>
  );
}

function Closing() {
  return (
    <section className="border-t border-line-subtle bg-sunken">
      <Reveal className="mx-auto grid max-w-7xl grid-cols-1 items-end gap-8 px-4 py-16 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] lg:px-8 lg:py-24">
        <div>
          <h2 className="max-w-2xl font-display text-3xl leading-[1.15] text-ink md:text-5xl md:leading-[1.1]">
            Todo tu negocio, a la vista y en buenas manos.
          </h2>
          <p className="mt-4 max-w-[52ch] leading-relaxed text-muted">
            Cuéntanos qué unidades tienes y te mostramos cómo se vería Argos Suite en tu día a día.
          </p>
        </div>
        <ContactButton className="justify-self-start px-6 py-3 text-base md:justify-self-end" />
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line-subtle">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="text-ink">
          <Lockup tone="auto" className="w-44" />
          <p className="mt-3 text-sm text-muted">
            Gestión de guarderías, peluquerías y veterinarias.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-sm text-muted md:items-end">
          <a href="/login" className="font-medium text-ink underline underline-offset-4">
            Iniciar sesión
          </a>
          <p>© 2026 Argos Suite</p>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadMotionFeatures}>
        <style>{PAGE_STYLES}</style>
        <div className="landing min-h-[100dvh] bg-canvas text-base text-ink">
          <Header />
          <main>
            <Hero />
            <Units />
            <OneRecord />
            <Modules />
            <Story />
            <Closing />
          </main>
          <Footer />
        </div>
      </LazyMotion>
    </MotionConfig>
  );
}
