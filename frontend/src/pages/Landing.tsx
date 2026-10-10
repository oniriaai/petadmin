import { useCallback, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import {
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  m,
  useReducedMotion,
  useScroll,
  useSpring,
} from "motion/react";
import {
  ArrowsClockwise,
  Bed,
  Bell,
  CalendarBlank,
  CalendarCheck,
  ChartBar,
  ClipboardText,
  Kanban,
  Notepad,
  Package,
  Receipt,
  Scissors,
  SignIn,
  SquaresFour,
  Van,
  Wallet,
  WarningCircle,
} from "../components/icons/PublicIcons";
import type { Icon } from "../components/icons/PublicIcons";
import { Lockup } from "../components/brand/Logo";
import { Meander } from "../components/brand/Meander";
import type { Catalog } from "../lib/billing";
import { cls } from "../lib/cls";
import marbleUrl from "../assets/landing/marble.webp";
import { FAQ_STYLES, Faq } from "./LandingFaq";
import type { Offer } from "./LandingFaq";
import { ContactButton, Header } from "./LandingHeader";
import { Pricing } from "./LandingPricing";
import { EASE, REVEAL_STYLES, Reveal, useSlidingPill } from "./LandingReveal";

/**
 * The public product page (BRAND.md is the source for its copy, colours and type).
 *
 * It claims only what has shipped: no customer figures, testimonials, electronic invoicing, or
 * delivery receipts for reminders. The prices are not written here: `LandingPricing` reads them
 * from the catalog the checkout charges from. The product views under `src/assets/landing/` are
 * screenshots of the main demo tenant, not mock-ups. Take them from a database seeded for the
 * purpose: one the e2e suites have run against shows their test rooms and tutors.
 *
 * Icons here are Phosphor, drawn inline (`components/icons/PublicIcons.tsx`); the application
 * itself still uses Lucide.
 *
 * `main.tsx` mounts this page on its own, outside the application's router and session, so it
 * links to the application with plain anchors.
 */

/**
 * Motion's animation engine arrives in its own chunk, after the page has painted. Until then an
 * `m` element simply holds its initial style, which is why nothing depends on it to be seen: the
 * hero's entrance and the sections' are CSS, and what Motion animates starts out visible.
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
 * The hero's entrance is here too, in CSS, so the first screen does not wait for Motion. The
 * headline and the screenshot only rise: an element that starts transparent is not counted as
 * the page's largest paint, and those two are it.
 *
 * The marble is one seamless tile of veins (`assets/landing/build-marble.py` draws it), white
 * where the stone is marked and used as a luminance mask over the ink colour, so the same file
 * veins the light canvas dark and the dark canvas light. It lies on the canvas only: the sunken
 * bands and the surfaces stay flat. A browser that cannot read a mask by luminance would lay
 * the ink over the whole canvas, so it gets no marble at all.
 */
const PAGE_STYLES = `
.landing {
  position: relative;
  isolation: isolate;
}
@supports (mask-mode: luminance) {
  .landing::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background: var(--color-ink);
    opacity: 0.16;
    mask: url(${marbleUrl}) top center / clamp(1600px, 110vw, 2400px) repeat;
    mask-mode: luminance;
  }
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
  /* Light veins on ink carry further than dark ones on marble. */
  .landing::before {
    opacity: 0.13;
  }
}
@keyframes landing-rise {
  from { opacity: 0; transform: translateY(16px); }
}
@keyframes landing-rise-solid {
  from { transform: translateY(16px); }
}
@media (prefers-reduced-motion: no-preference) {
  .landing-rise,
  .landing-rise-solid {
    animation: landing-rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(var(--rise-order) * 90ms);
  }
  .landing-rise-solid {
    animation-name: landing-rise-solid;
  }
}
${REVEAL_STYLES}${FAQ_STYLES}`;

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
  bare = false,
  className,
}: {
  name: string;
  alt: string;
  /** The width the image is laid out at, so the browser can pick a file before layout. */
  sizes: string;
  eager?: boolean;
  /** Inside a frame that already draws the card. */
  bare?: boolean;
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
        "block h-auto w-full bg-surface",
        !bare && "rounded-xl border border-line-subtle shadow-raised",
        className,
      )}
    />
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
        className="landing-rise-solid mt-4 max-w-5xl font-display text-4xl leading-[1.1] text-ink md:text-5xl lg:text-6xl"
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
        {/* A window around the screenshot, so it reads as the product and not as a picture. */}
        <div
          style={rise(3)}
          className="landing-rise-solid overflow-hidden rounded-xl border border-line bg-surface shadow-overlay"
        >
          <div
            aria-hidden="true"
            className="flex h-9 items-center gap-1.5 border-b border-line-subtle bg-sunken px-3.5"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
          </div>
          <Shot
            eager
            bare
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
  const slider = useSlidingPill(activeId);
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
          ref={slider.group}
          role="tablist"
          aria-label="Unidades de negocio"
          onKeyDown={onKeyDown}
          className="relative mt-8 flex flex-wrap gap-2"
        >
          {slider.pill(cls("rounded-lg", active.tab))}
          {UNITS.map((unit) => {
            const selected = unit.id === activeId;
            return (
              <button
                key={unit.id}
                ref={(node) => {
                  tabRefs.current[unit.id] = node;
                  slider.option(unit.id)(node);
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
                {unit.name}
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
                sizes="(min-width: 1280px) 1150px, (min-width: 640px) calc(100vw - 7rem), calc(100vw - 4.5rem)"
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

/** The vaccine reminder registered as a WhatsApp template, filled with its example values. */
const REMINDER_EXAMPLE = {
  body: "Hola Ana, te escribimos de Clínica Veterinaria Sur. Max tiene pendiente el refuerzo de Antirrábica, previsto para el 12 de octubre. Para agendar su cita, escríbenos al 099 123 4567.",
  footer: "Enviado con Argos Suite. Este número no recibe respuestas.",
};

function ModuleShot({ name, alt }: { name: string; alt: string }) {
  return (
    <div className="mt-auto pl-6 sm:pl-8">
      <img
        {...shotSources(name)}
        sizes="(min-width: 1280px) 580px, (min-width: 768px) 46vw, calc(100vw - 3.5rem)"
        alt={alt}
        width={1440}
        height={900}
        loading="lazy"
        decoding="async"
        className="block h-56 w-full rounded-tl-xl border-l border-t border-line-subtle object-cover object-left-top"
      />
    </div>
  );
}

function Modules() {
  // The entrance is on the cell and the hover on the tile inside it: both are transitions,
  // and one element cannot carry two.
  const cell = "flex";
  const tile =
    "flex w-full flex-col overflow-hidden rounded-xl border border-line-subtle transition-[border-color,box-shadow] duration-300 hover:border-line hover:shadow-raised";
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

        {/* Five modules: the two with a screen to show side by side, then the reminder, two
            rows tall beside the last two. One column on a phone. */}
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Reveal className={cell}>
            <div className={cls(tile, "bg-surface")}>
              <div className="p-6 sm:p-8">
                <ModuleText
                  Icon={Wallet}
                  name="Argos Finanzas"
                  line="Cobros, cuentas por pagar y proveedores, con las cuentas de cada unidad por separado."
                />
              </div>
              <ModuleShot
                name="finanzas"
                alt="Pantalla de gestión financiera con los cobros del periodo"
              />
            </div>
          </Reveal>

          <Reveal delay={0.08} className={cell}>
            <div className={cls(tile, "bg-surface")}>
              <div className="p-6 sm:p-8">
                <ModuleText
                  Icon={ChartBar}
                  name="Argos Informes"
                  line="Informes y gráficos del periodo, con exportación a Excel."
                />
              </div>
              <ModuleShot name="informes" alt="Pantalla de informes con los gráficos del periodo" />
            </div>
          </Reveal>

          <Reveal className={cls(cell, "md:row-span-2")}>
            <div className={cls(tile, "justify-between gap-8 bg-sunken p-6 sm:p-8")}>
              <ModuleText
                Icon={Bell}
                name="Argos Recordatorios"
                line="Citas, vacunas y controles pendientes: un mensaje que tus tutores reciben por WhatsApp o por correo, a nombre de tu negocio."
              />
              <figure>
                <blockquote className="max-w-[46ch] rounded-xl rounded-bl-sm border border-line-subtle bg-surface p-4 text-sm leading-relaxed text-ink shadow-raised">
                  <p>{REMINDER_EXAMPLE.body}</p>
                  <p className="mt-2 text-xs text-muted">{REMINDER_EXAMPLE.footer}</p>
                </blockquote>
                <figcaption className="mt-3 text-xs text-muted">
                  Un recordatorio de vacuna, como lo recibe un tutor.
                </figcaption>
              </figure>
            </div>
          </Reveal>

          <Reveal delay={0.08} className={cell}>
            <div className={cls(tile, "bg-sunken p-6 sm:p-8")}>
              <ModuleText
                Icon={Package}
                name="Argos Inventario"
                line="Artículos, movimientos de entrada y salida, y un aviso cuando el stock llega al mínimo."
              />
            </div>
          </Reveal>

          <Reveal delay={0.16} className={cell}>
            <div className={cls(tile, "justify-between gap-10 bg-sunken p-6 sm:p-8")}>
              <ModuleText
                Icon={WarningCircle}
                name="Argos Alertas"
                line="Alertas operativas y sanitarias por mascota, a la vista de todo el equipo."
              />
              <div className="text-action dark:text-oro">
                <Meander />
              </div>
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
  // Until the price list says otherwise, the answers assume what a deployment normally offers.
  const [offer, setOffer] = useState<Offer>({ trial: true, checkout: true });
  const onCatalog = useCallback((catalog: Catalog | null) => {
    setOffer({
      trial: catalog?.trial.available ?? false,
      checkout: catalog?.checkoutAvailable ?? false,
    });
  }, []);
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
            <Pricing onCatalog={onCatalog} />
            <Faq offer={offer} />
            <Story />
            <Closing />
          </main>
          <Footer />
        </div>
      </LazyMotion>
    </MotionConfig>
  );
}
