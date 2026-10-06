import { CaretDown } from "../components/icons/PublicIcons";
import { EASE, Reveal } from "./LandingReveal";

/**
 * The questions a buyer asks before signing up.
 *
 * Every answer restates a rule of `docs/suscripciones.md` or `docs/recordatorios.md`; none
 * carries a price, a number of days or a discount, which the price list above reads from the
 * catalog. An answer about the trial or about paying online is shown only where the deployment
 * offers it, as the price list does.
 *
 * Each item is a native `<details>`, so it opens before any script has loaded. Where the
 * browser can animate to an automatic height it slides; elsewhere it simply opens.
 */

export const FAQ_STYLES = `
.landing-faq {
  interpolate-size: allow-keywords;
}
@media (prefers-reduced-motion: no-preference) {
  .landing-faq details::details-content {
    block-size: 0;
    overflow-y: clip;
    transition:
      block-size 0.35s cubic-bezier(${EASE.join(", ")}),
      content-visibility 0.35s allow-discrete;
  }
  .landing-faq details[open]::details-content {
    block-size: auto;
  }
}`;

/** What the deployment sells, as far as the answers depend on it. */
export interface Offer {
  trial: boolean;
  checkout: boolean;
}

interface Question {
  ask: string;
  answer: string;
  /** Shown only where this is on offer. */
  needs?: keyof Offer;
}

const QUESTIONS: Question[] = [
  {
    ask: "¿Puedo probar Argos Suite antes de pagar?",
    answer:
      "Sí. La prueba gratuita incluye las tres unidades y todos los módulos, y no pedimos tarjeta: solo confirmas tu correo. Durante la prueba, los recordatorios a tus tutores salen por correo.",
    needs: "trial",
  },
  {
    ask: "¿Qué pasa cuando termina la prueba?",
    answer:
      "Te avisamos por correo antes de que termine. Después, tu espacio queda en pausa hasta que eliges un plan y lo pagas desde tu cuenta; las unidades y los módulos se ajustan a lo que ese plan incluye.",
    needs: "trial",
  },
  {
    ask: "¿Cómo se paga?",
    answer:
      "Con tarjeta, a través de PayPhone. El número de tu tarjeta nunca pasa por Argos Suite, y solo se guarda para las renovaciones si tú lo autorizas. El recibo de cada pago te llega por correo.",
    needs: "checkout",
  },
  {
    ask: "¿Qué significa que cada unidad lleve sus cuentas por separado?",
    answer:
      "Guardería, peluquería y veterinaria comparten tutores y mascotas, pero los ingresos de cada una se registran aparte. Así ves cómo va cada unidad sin mezclar sus números.",
  },
  {
    ask: "¿Puedo sumar un módulo o una unidad más adelante?",
    answer:
      "Sí. Escríbenos y lo activamos en tu cuenta. Lo que ya tienes registrado sigue en su lugar.",
  },
  {
    ask: "¿Quién recibe los recordatorios?",
    answer:
      "Los tutores de tus mascotas, por WhatsApp o por correo y a nombre de tu negocio, en el teléfono y el correo que constan en su ficha. Tú decides en cada unidad si se envían a mano o de forma automática.",
  },
];

export function Faq({ offer }: { offer: Offer }) {
  const questions = QUESTIONS.filter((question) => !question.needs || offer[question.needs]);
  return (
    <section id="preguntas" className="scroll-mt-16 border-t border-line-subtle">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-x-12 gap-y-8 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:px-8 lg:py-24">
        <Reveal>
          <h2 className="font-display text-3xl leading-[1.15] text-ink md:text-4xl">
            Preguntas antes de empezar
          </h2>
          <p className="mt-3 max-w-[40ch] leading-relaxed text-muted">
            Si la tuya no está aquí, escríbenos y te respondemos.
          </p>
        </Reveal>
        <Reveal delay={0.08} className="landing-faq border-t border-line-subtle">
          {questions.map((question) => (
            <details key={question.ask} className="group border-b border-line-subtle">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-display text-xl leading-snug text-ink [&::-webkit-details-marker]:hidden">
                {question.ask}
                <CaretDown
                  size={20}
                  aria-hidden="true"
                  className="shrink-0 text-muted transition-transform duration-300 group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <p className="max-w-[68ch] pb-6 leading-relaxed text-muted">{question.answer}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
