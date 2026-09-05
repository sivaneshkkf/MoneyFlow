import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import Seo from '../../../components/common/Seo'
import { LEGAL_INFO } from '../../../config/businessConfig'

const scrollToSection = (id) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * A section's `content` is a plain array of "blocks" so page files stay
 * terse, readable data rather than hand-written JSX:
 *   'a paragraph'               -> <p>
 *   <>a paragraph with a <Link>-> <p> (a JSX fragment/element is wrapped as-is)
 *   { bullets: ['a', 'b'] }     -> <ul>
 */
function SectionBlocks({ blocks }) {
  return blocks.map((block, i) =>
    block && typeof block === 'object' && Array.isArray(block.bullets) ? (
      <ul key={i} className="list-disc space-y-1.5 pl-5">
        {block.bullets.map((b, j) => (
          <li key={j}>{b}</li>
        ))}
      </ul>
    ) : (
      <p key={i}>{block}</p>
    ),
  )
}

function TableOfContents({ sections, className = '' }) {
  return (
    <nav className={className}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">On this page</p>
      <ul className="space-y-0.5">
        {sections.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => scrollToSection(s.id)}
              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-ink-soft transition hover:bg-brand-50 hover:text-ink dark:hover:bg-white/5 dark:hover:text-white"
            >
              {i + 1}. {s.heading}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * Shared shell for every legal document (Terms, Privacy, Refund Policy).
 * Desktop: sticky table of contents beside the content. Mobile: a
 * collapsible "Jump to section" list above it. `sections` is
 * [{ id, heading, content: ReactNode }].
 */
export default function LegalPageLayout({ title, description, sections }) {
  const [mobileTocOpen, setMobileTocOpen] = useState(false)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <Seo title={title} description={description} />

      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {description && <p className="mt-3 text-base text-ink-soft">{description}</p>}
        <p className="mt-4 text-sm text-ink-soft">Last updated: {LEGAL_INFO.lastUpdated}</p>
      </div>

      {/* Mobile table of contents */}
      <div className="mt-6 rounded-xl border border-line lg:hidden dark:border-white/10">
        <button
          type="button"
          onClick={() => setMobileTocOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold"
          aria-expanded={mobileTocOpen}
        >
          Jump to section
          <ChevronDown className={`h-4 w-4 transition ${mobileTocOpen ? 'rotate-180' : ''}`} />
        </button>
        {mobileTocOpen && (
          <div className="border-t border-line px-2 pb-2 dark:border-white/10">
            <TableOfContents
              sections={sections}
              className="pt-2"
            />
          </div>
        )}
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <TableOfContents sections={sections} />
          </div>
        </aside>

        <div className="min-w-0 space-y-10">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="text-lg font-bold tracking-tight sm:text-xl">{s.heading}</h2>
              <div className="mt-3 space-y-3 text-[15px] leading-[1.7] text-ink-soft sm:text-base">
                <SectionBlocks blocks={s.content} />
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
