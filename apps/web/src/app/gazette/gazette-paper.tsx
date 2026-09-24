import Link from "next/link";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { LocalDate, FULL_DATE } from "@/components/local-date";
import {
  type GazetteEditionData,
  type GazetteStory,
  type GazetteResponse,
  type GazetteSection,
  editionLabel,
  formatCount,
  publisherOf,
  responseHref,
  sectionLabel,
  sharedLine,
  storyHref,
  writeAboutHref,
} from "@/lib/gazette";
import { Ago } from "./ago";
import { FollowSection } from "./follow-section";
import { StoryImage } from "./story-image";

// How the front page is cut up. Everything after these goes into sections.
const LEAD = 1;
const RAIL = 5;
const TOP = 6;
const SECTION_SIZE = 4;

interface PaperProps {
  data: GazetteEditionData;
  section: string | null;
  signedIn: boolean;
  /** "/gazette" for today's paper, "/gazette/edition/12" for an old one. */
  basePath: string;
}

export function GazettePaper({ data, section, signedIn, basePath }: PaperProps) {
  const { edition, stories, sections } = data;
  if (!edition) return <EmptyPaper />;

  const counts = sectionCounts(stories);
  const activeSections = orderSections(sections, counts, data.my_sections);

  return (
    <div className="gz">
      <Masthead data={data} />
      <nav className="gz-sections" aria-label="Sections">
        <Link href={basePath} className={`gz-section-link ${!section ? "gz-section-link--on" : ""}`}>
          Front page
        </Link>
        {activeSections.map((s) => (
          <Link
            key={s.id}
            href={`${basePath}?section=${s.id}`}
            className={`gz-section-link ${section === s.id ? "gz-section-link--on" : ""}`}
          >
            {s.label}
            <span className="gz-section-count">{counts[s.id]}</span>
          </Link>
        ))}
      </nav>

      {!edition.latest && (
        <p className="gz-archive-note">
          You&rsquo;re reading an old edition.{" "}
          <Link href="/gazette">Today&rsquo;s paper &rarr;</Link>
        </p>
      )}

      {section ? (
        <SectionView
          stories={stories.filter((s) => s.topics.includes(section))}
          section={section}
          sections={sections}
          mySections={data.my_sections}
          signedIn={signedIn}
          basePath={basePath}
        />
      ) : (
        <FrontPage data={data} activeSections={activeSections} />
      )}

      <Colophon data={data} />
    </div>
  );
}

// ── Masthead ───────────────────────────────────────────────────────────

function Masthead({ data }: { data: GazetteEditionData }) {
  const e = data.edition!;
  return (
    <header className="gz-masthead">
      <div className="gz-masthead-top">
        <span>
          No. {e.number} &middot; {editionLabel(e.slot)}
        </span>
        <LocalDate iso={e.published_at} options={FULL_DATE} className="gz-masthead-date" />
        <span className="gz-masthead-count">
          {e.story_count} stories &middot; {e.publisher_count} publishers
        </span>
      </div>
      <h1 className="gz-title">The Inkwell Gazette</h1>
      <p className="gz-tagline">
        What the fediverse is reading, and what Inkwell writers make of it.
      </p>
      <p className="gz-masthead-sub">
        {formatCount(e.people_sharing)} people across the fediverse shared today&rsquo;s stories.
        No algorithm chose them and no AI touched them.{" "}
        <a href="#how-this-paper-is-made">How this paper is made</a>
      </p>
    </header>
  );
}

// ── Front page ─────────────────────────────────────────────────────────

function FrontPage({ data, activeSections }: { data: GazetteEditionData; activeSections: GazetteSection[] }) {
  const { stories, sections, responses } = data;
  const lead = stories[0];
  const rail = stories.slice(LEAD, LEAD + RAIL);
  const top = stories.slice(LEAD + RAIL, LEAD + RAIL + TOP);
  const shown = new Set([lead, ...rail, ...top].filter(Boolean).map((s) => s.id));
  const rest = stories.filter((s) => !shown.has(s.id));

  // Each remaining story appears once, under its strongest section (the one
  // its kicker names).
  const bySection = new Map<string, GazetteStory[]>();
  const unfiled: GazetteStory[] = [];
  for (const s of rest) {
    const home = s.topics[0];
    if (home) bySection.set(home, [...(bySection.get(home) ?? []), s]);
    else unfiled.push(s);
  }
  // A section with a single story isn't worth a heading of its own.
  for (const [id, list] of bySection) {
    if (list.length < 2) {
      unfiled.push(...list);
      bySection.delete(id);
    }
  }

  return (
    <>
      <section className="gz-front">
        {lead && <LeadStory story={lead} sections={sections} />}
        {rail.length > 0 && (
          <aside className="gz-rail" aria-label="Most shared">
            <h2 className="gz-rail-title">Most shared</h2>
            <ol className="gz-rail-list">
              {rail.map((s, i) => (
                <li key={s.id} className="gz-rail-item">
                  <span className="gz-rail-num">{i + 2}</span>
                  <div>
                    <Kicker story={s} sections={sections} />
                    <Link href={storyHref(s.id)} className="gz-rail-headline">
                      {s.title}
                    </Link>
                    <div className="gz-meta">
                      {publisherOf(s)} &middot; {formatCount(s.shares_today || s.shares_week)} sharing
                      {!!s.response_count && <> &middot; {s.response_count} on Inkwell</>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </section>

      {top.length > 0 && (
        <section className="gz-block">
          <SectionRule label="Top stories" />
          <div className="gz-grid gz-grid--3">
            {top.map((s) => (
              <StoryCard key={s.id} story={s} sections={sections} />
            ))}
          </div>
        </section>
      )}

      <InkwellResponds responses={responses} stories={stories} lead={lead} />

      {activeSections
        .filter((sec) => bySection.has(sec.id))
        .map((sec) => (
          <section key={sec.id} className="gz-block">
            <SectionRule label={sec.label} href={`?section=${sec.id}`} />
            <div className="gz-grid gz-grid--2">
              {bySection
                .get(sec.id)!
                .slice(0, SECTION_SIZE)
                .map((s) => (
                  <StoryBrief key={s.id} story={s} sections={sections} underSection={sec.id} />
                ))}
            </div>
          </section>
        ))}

      {unfiled.length > 0 && (
        <section className="gz-block">
          <SectionRule label="Also in the news" />
          <div className="gz-grid gz-grid--2">
            {unfiled.map((s) => (
              <StoryBrief key={s.id} story={s} sections={sections} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function LeadStory({ story, sections }: { story: GazetteStory; sections: GazetteSection[] }) {
  return (
    <article className="gz-lead">
      {story.image_url && (
        <Link href={storyHref(story.id)} tabIndex={-1} aria-hidden>
          <StoryImage src={story.image_url} alt={story.image_description ?? ""} className="gz-lead-figure" eager />
        </Link>
      )}
      <Kicker story={story} sections={sections} />
      <h2 className="gz-lead-headline">
        <Link href={storyHref(story.id)}>{story.title}</Link>
      </h2>
      {story.description && <p className="gz-lead-deck">{story.description}</p>}
      <Byline story={story} />
      <div className="gz-actions">
        <a href={story.url} target="_blank" rel="noopener noreferrer nofollow" className="gz-btn gz-btn--primary">
          Read at {publisherOf(story)} &#8599;
        </a>
        <Link href={storyHref(story.id)} className="gz-btn">
          What people are saying
        </Link>
        <Link href={writeAboutHref(story.id)} className="gz-btn">
          &#9998; Write about this
        </Link>
      </div>
    </article>
  );
}

function StoryCard({
  story,
  sections,
  underSection,
}: {
  story: GazetteStory;
  sections: GazetteSection[];
  underSection?: string;
}) {
  return (
    <article className="gz-card">
      {story.image_url && (
        <Link href={storyHref(story.id)} tabIndex={-1} aria-hidden>
          <StoryImage src={story.image_url} alt="" className="gz-card-figure" />
        </Link>
      )}
      <Kicker story={story} sections={sections} underSection={underSection} />
      <h3 className="gz-card-headline">
        <Link href={storyHref(story.id)}>{story.title}</Link>
      </h3>
      {story.description && <p className="gz-card-deck">{story.description}</p>}
      <Byline story={story} compact />
    </article>
  );
}

function StoryBrief({
  story,
  sections,
  underSection,
}: {
  story: GazetteStory;
  sections: GazetteSection[];
  underSection?: string;
}) {
  return (
    <article className="gz-brief">
      <Kicker story={story} sections={sections} underSection={underSection} />
      <h3 className="gz-brief-headline">
        <Link href={storyHref(story.id)}>{story.title}</Link>
      </h3>
      {story.description && <p className="gz-brief-deck">{story.description}</p>}
      <Byline story={story} compact />
    </article>
  );
}

function Kicker({
  story,
  sections,
  underSection,
}: {
  story: GazetteStory;
  sections: GazetteSection[];
  /** Already under this section's heading, so don't repeat it. */
  underSection?: string;
}) {
  const parts: string[] = [];
  if (story.opinion) parts.push("Opinion");
  if (story.topics[0] && story.topics[0] !== underSection) parts.push(sectionLabel(sections, story.topics[0]));
  if (story.continuing) parts.push("Still trending");
  if (parts.length === 0) return null;
  return (
    <div className={`gz-kicker ${story.opinion ? "gz-kicker--opinion" : ""}`}>{parts.join(" · ")}</div>
  );
}

function Byline({ story, compact = false }: { story: GazetteStory; compact?: boolean }) {
  return (
    <div className="gz-byline">
      {story.author_name && !compact && <span className="gz-byline-author">By {story.author_name}</span>}
      <span className="gz-byline-publisher">{publisherOf(story)}</span>
      {story.article_published_at && <Ago iso={story.article_published_at} />}
      <span className="gz-byline-shared" title={`Trending on ${story.trending_on.join(", ")}`}>
        {sharedLine(story)}
      </span>
      {!!story.response_count && (
        <Link href={storyHref(story.id)} className="gz-byline-responses">
          {story.response_count} Inkwell {story.response_count === 1 ? "response" : "responses"}
        </Link>
      )}
    </div>
  );
}

function SectionRule({ label, href }: { label: string; href?: string }) {
  return (
    <div className="gz-rule">
      <h2 className="gz-rule-label">
        {href ? <Link href={href}>{label}</Link> : label}
      </h2>
    </div>
  );
}

// ── Inkwell responds ───────────────────────────────────────────────────

function InkwellResponds({
  responses,
  stories,
  lead,
}: {
  responses: GazetteResponse[];
  stories: GazetteStory[];
  lead: GazetteStory | undefined;
}) {
  const titleOf = new Map(stories.map((s) => [s.id, s.title]));

  return (
    <section className="gz-responds">
      <div className="gz-responds-head">
        <h2 className="gz-responds-title">Inkwell responds</h2>
        <p className="gz-responds-sub">
          Journal entries our writers wrote about today&rsquo;s news. Anyone can add one: open a story and press{" "}
          <em>Write about this</em>.
        </p>
      </div>
      {responses.length > 0 ? (
        <div className="gz-grid gz-grid--3">
          {responses.map((r) => (
            <Link key={r.id} href={responseHref(r)} className="gz-response">
              <div className="gz-response-author">
                <AvatarWithFrame url={r.author.avatar_url} name={r.author.display_name} size={28} frame={r.author.avatar_frame} />
                <span>{r.author.display_name}</span>
              </div>
              <div className="gz-response-title">{r.title || r.excerpt || "Untitled"}</div>
              {r.gazette_story_id && titleOf.get(r.gazette_story_id) && (
                <div className="gz-response-on">on &ldquo;{titleOf.get(r.gazette_story_id)}&rdquo;</div>
              )}
            </Link>
          ))}
        </div>
      ) : (
        lead && (
          <div className="gz-responds-empty">
            <p>Nobody on Inkwell has written about this edition&rsquo;s news yet.</p>
            <Link href={writeAboutHref(lead.id)} className="gz-btn gz-btn--primary">
              &#9998; Be the first: write about the top story
            </Link>
          </div>
        )
      )}
    </section>
  );
}

// ── Section view ───────────────────────────────────────────────────────

function SectionView({
  stories,
  section,
  sections,
  mySections,
  signedIn,
  basePath,
}: {
  stories: GazetteStory[];
  section: string;
  sections: GazetteSection[];
  mySections: string[];
  signedIn: boolean;
  basePath: string;
}) {
  const label = sectionLabel(sections, section);
  return (
    <section className="gz-block">
      <div className="gz-section-head">
        <h2 className="gz-section-title">{label}</h2>
        <FollowSection sectionId={section} label={label} mySections={mySections} signedIn={signedIn} />
      </div>
      {stories.length === 0 ? (
        <p className="gz-empty-line">
          Nothing in {label} in this edition. <Link href={basePath}>Back to the front page</Link>
        </p>
      ) : (
        <div className="gz-grid gz-grid--2">
          {stories.map((s) => (
            <StoryCard key={s.id} story={s} sections={sections} underSection={section} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Colophon ───────────────────────────────────────────────────────────

function Colophon({ data }: { data: GazetteEditionData }) {
  const e = data.edition!;
  const m = data.method;
  return (
    <footer className="gz-colophon" id="how-this-paper-is-made">
      <nav className="gz-edition-nav" aria-label="Editions">
        {e.previous_number ? (
          <Link href={`/gazette/edition/${e.previous_number}`}>&larr; Previous edition</Link>
        ) : (
          <span />
        )}
        <Link href="/gazette/editions">All editions</Link>
        {e.next_number ? (
          <Link href={e.latest ? "/gazette" : `/gazette/edition/${e.next_number}`}>Next edition &rarr;</Link>
        ) : (
          <span />
        )}
      </nav>
      <h2 className="gz-colophon-title">How this paper is made</h2>
      <p>
        Twice a day, at about 7am and 6pm US Eastern, we read the links trending on{" "}
        {m ? m.sources.join(", ") : "several Mastodon servers"}. Those servers count how many different
        people shared each link. A story&rsquo;s place in the paper is that count for today, plus a quarter
        of the week&rsquo;s, halved if the article is more than two days old. At most{" "}
        {m?.per_publisher ?? 3} stories come from any one publisher.
      </p>
      <p>
        That&rsquo;s the whole formula. There is no engagement model, no AI, no paid placement, and nothing
        about you changes what the paper says. Sections are sorted by simple rules: the section the publisher
        filed the story under, and words in the headline. Pieces filed as opinion are labeled Opinion.
      </p>
    </footer>
  );
}

function EmptyPaper() {
  return (
    <div className="gz">
      <header className="gz-masthead">
        <h1 className="gz-title">The Inkwell Gazette</h1>
        <p className="gz-tagline">What the fediverse is reading, and what Inkwell writers make of it.</p>
      </header>
      <p className="gz-empty-line">
        The first edition is being set. Check back in a little while.
      </p>
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────────────

function sectionCounts(stories: GazetteStory[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of stories) for (const t of s.topics) counts[t] = (counts[t] ?? 0) + 1;
  return counts;
}

/** Sections that have stories: the reader's followed ones first, then busiest. */
function orderSections(
  sections: GazetteSection[],
  counts: Record<string, number>,
  mine: string[]
): GazetteSection[] {
  return sections
    .filter((s) => counts[s.id])
    .sort((a, b) => {
      const am = mine.includes(a.id) ? 0 : 1;
      const bm = mine.includes(b.id) ? 0 : 1;
      if (am !== bm) return am - bm;
      return counts[b.id] - counts[a.id] || a.label.localeCompare(b.label);
    });
}
