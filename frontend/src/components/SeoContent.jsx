import {
  ArrowUp, ArrowUpRight, Check, ChevronDown, Cpu, Fan, Gamepad2, HardDrive, Lightbulb,
  MemoryStick, MessageSquareText, PcCase, ShieldCheck, Store, Zap,
} from 'lucide-react';
import { HOW_IT_WORKS, FAQ, LANDING_PAGES } from '../seo/pages';

// Crawlable copy shown under the start screen. The same data is written into static HTML by
// scripts/prerender.mjs, so keep the headings and text in step with that script. Everything is
// real DOM text (details/summary for the FAQ), so it is indexable whether or not it is expanded.

const STEP_ICONS = [MessageSquareText, ShieldCheck, Store];

// Pick an icon from the sentence itself so the list can be reordered per page.
function partIcon(text) {
  const t = text.toLowerCase();
  if (/processor|cpu|core/.test(t)) return Cpu;
  if (/graphics|gpu/.test(t)) return Gamepad2;
  if (/\bram\b|memory/.test(t)) return MemoryStick;
  if (/ssd|nvme|storage/.test(t)) return HardDrive;
  if (/cooler|airflow|fan/.test(t)) return Fan;
  if (/power supply|psu|case/.test(t)) return PcCase;
  return Check;
}

const USE_LABEL = { gaming: 'Gaming', editing: 'Editing', office: 'Office' };

function formatBudget(budget) {
  return budget >= 100000
    ? `${budget / 100000} lakh`.replace('.0', '')
    : `${budget / 1000}k`;
}

function SectionHeading({ id, eyebrow, children }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-accent">{eyebrow}</p>
      <h2 id={id} className="mt-1.5 text-2xl sm:text-3xl font-semibold tracking-tight text-fg text-balance">
        {children}
      </h2>
    </div>
  );
}

export default function SeoContent({ page = null, onStart }) {
  const faq = page ? [...page.faq, ...FAQ] : FAQ;
  const others = LANDING_PAGES.filter((p) => p.slug !== page?.slug);

  return (
    <div className="max-w-4xl mx-auto mt-20 sm:mt-24 space-y-20 sm:space-y-24 pb-8">
      {page && (
        <section aria-labelledby="seo-expect" className="space-y-8">
          <SectionHeading id="seo-expect" eyebrow={`${formatBudget(page.budget)} BDT budget`}>
            What to expect at this budget
          </SectionHeading>

          <ul className="grid gap-3 sm:grid-cols-2">
            {page.expect.map((item) => {
              const Icon = partIcon(item);
              return (
                <li key={item} className="card p-4 flex gap-3.5 items-start">
                  <span className="w-10 h-10 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0" aria-hidden="true">
                    <Icon size={20} strokeWidth={1.75} />
                  </span>
                  <p className="text-sm text-fg-2 leading-relaxed pt-0.5">{item}</p>
                </li>
              );
            })}
          </ul>

          <div className="rounded-xl border border-accent-line bg-accent-soft p-5 sm:p-6">
            <h3 className="flex items-center gap-2 text-base font-semibold text-fg">
              <Lightbulb size={18} strokeWidth={1.75} className="text-accent" aria-hidden="true" />
              Tips for this budget
            </h3>
            <ul className="mt-4 space-y-3">
              {page.tips.map((tip) => (
                <li key={tip} className="flex gap-3 text-sm text-fg-2 leading-relaxed">
                  <Check size={16} strokeWidth={2} className="text-accent mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section aria-labelledby="seo-how" className="space-y-8">
        <SectionHeading id="seo-how" eyebrow="How it works">
          From budget to build in three steps
        </SectionHeading>

        <ol className="grid gap-4 md:grid-cols-3">
          {HOW_IT_WORKS.map((step, index) => {
            const Icon = STEP_ICONS[index] || Zap;
            return (
              <li key={step.title} className="card p-5 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="w-10 h-10 rounded-lg bg-accent-soft text-accent flex items-center justify-center" aria-hidden="true">
                    <Icon size={20} strokeWidth={1.75} />
                  </span>
                  <span className="num text-sm font-medium text-fg-3" aria-hidden="true">0{index + 1}</span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-fg">{step.title}</h3>
                <p className="mt-2 text-sm text-fg-2 leading-relaxed">{step.text}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="seo-faq" className="space-y-8">
        <SectionHeading id="seo-faq" eyebrow="FAQ">
          Frequently asked questions
        </SectionHeading>

        <div className="card divide-y divide-line overflow-hidden">
          {faq.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex items-center justify-between gap-4 px-5 py-4 min-h-14 cursor-pointer list-none text-left text-base font-medium text-fg hover:bg-surface-2 transition-colors [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]">
                <span>{item.q}</span>
                <ChevronDown
                  size={18}
                  strokeWidth={1.75}
                  className="shrink-0 text-fg-3 transition-transform duration-200 group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="px-5 pb-5 -mt-1 text-sm text-fg-2 leading-relaxed max-w-3xl">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <nav aria-labelledby="seo-more" className="space-y-8">
        <SectionHeading id="seo-more" eyebrow="Explore">
          PC builds by budget
        </SectionHeading>

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((p) => (
            <li key={p.slug}>
              <a
                href={`/${p.slug}`}
                className="tactile-btn card h-full p-4 flex items-start justify-between gap-3 hover:border-line-strong hover:bg-surface-2 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-fg">{p.h1}</span>
                  <span className="mt-2 flex items-center gap-2">
                    <span className="chip">{USE_LABEL[p.useCase] || 'General'}</span>
                    <span className="chip num">{formatBudget(p.budget)}</span>
                  </span>
                </span>
                <ArrowUpRight size={18} strokeWidth={1.75} className="text-fg-3 shrink-0 mt-0.5" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="card p-6 sm:p-8 text-center">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-fg text-balance">
          Ready to build yours?
        </h2>
        <p className="mt-2 text-sm text-fg-2">Type your budget and what the PC is for. It takes a few seconds.</p>
        <button type="button" onClick={onStart} className="btn btn-primary btn-touch mt-5 px-5 inline-flex">
          <ArrowUp size={16} strokeWidth={2} aria-hidden="true" />
          <span>Start a build</span>
        </button>
      </div>
    </div>
  );
}
