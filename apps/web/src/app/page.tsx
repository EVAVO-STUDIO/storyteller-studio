const workflow = [
  { label: "Manuscript", detail: "Immutable source and chapter map", state: "ready" },
  { label: "Story bible", detail: "Characters, places and pronunciations", state: "review" },
  { label: "Direction", detail: "Narrative stance and dramatic beats", state: "active" },
  { label: "Calibration", detail: "Narrator and character reference takes", state: "blocked" },
  { label: "Production", detail: "Candidate takes and chapter assembly", state: "waiting" },
  { label: "Mastering", detail: "Delivery profiles and release package", state: "waiting" },
];

const directionValues = [
  { label: "Pace", value: 72, note: "Measured, never ponderous" },
  { label: "Intensity", value: 38, note: "Pressure beneath restraint" },
  { label: "Warmth", value: 54, note: "Close, not sentimental" },
  { label: "Clarity", value: 91, note: "Protect long syntax" },
];

const reviewItems = [
  { title: "Consent evidence", detail: "Required before any custom-voice calibration", tone: "critical" },
  { title: "Pronunciation review", detail: "4 proposed names need author approval", tone: "review" },
  { title: "Provider route", detail: "Capability negotiation has not been run", tone: "neutral" },
];

const qaGates = [
  ["Exact text", "Required", "Every take aligned to immutable source offsets"],
  ["Final word", "Required", "End-of-segment truncation detection"],
  ["Continuity", "Review", "Pitch, rate, pause, energy and embedding drift"],
  ["Engineering", "Required", "Loudness, peak, noise, clipping and silence"],
];

function StatePill({ state }: Readonly<{ state: string }>) {
  return <span className={`state state-${state}`}>{state}</span>;
}

export default function StudioHomePage() {
  return (
    <div className="studio-shell">
      <header className="topbar">
        <div className="brand-lockup" aria-label="EVAVO Storyteller Studio">
          <span className="evavo-mark">E</span>
          <span className="brand-name">EVAVO</span>
          <span className="brand-divider" aria-hidden="true" />
          <span className="product-name">Storyteller Studio</span>
        </div>
        <div className="topbar-actions">
          <span className="environment-badge">Source foundation</span>
          <button className="quiet-button" type="button" disabled title="Deployment and signed launch are not configured">
            Launch unavailable
          </button>
        </div>
      </header>

      <aside className="sidebar" aria-label="Studio navigation">
        <nav>
          <p className="nav-label">Workspace</p>
          <a className="nav-item nav-item-active" href="#overview"><span>OV</span>Overview</a>
          <a className="nav-item" href="#manuscript"><span>MS</span>Manuscript</a>
          <a className="nav-item" href="#direction"><span>DR</span>Direction</a>
          <a className="nav-item" href="#voices"><span>VO</span>Voices</a>
          <a className="nav-item" href="#takes"><span>TK</span>Takes</a>
          <a className="nav-item" href="#visuals"><span>VI</span>Visual story</a>
          <a className="nav-item" href="#delivery"><span>DL</span>Delivery</a>
        </nav>
        <div className="sidebar-note">
          <span className="signal-dot" />
          <div>
            <strong>No provider connected</strong>
            <p>Generation remains fail-closed until rights, budget and adapter configuration are approved.</p>
          </div>
        </div>
      </aside>

      <main className="workspace" id="overview">
        <section className="project-heading">
          <div>
            <p className="eyebrow">DEMONSTRATION WORKSPACE · NO PRIVATE MANUSCRIPT LOADED</p>
            <h1>Direct the performance.<br />Protect the story.</h1>
            <p className="project-summary">
              A review-first production workspace for narration that preserves the author’s language,
              carries emotional intention and stays recognisably consistent across a complete series.
            </p>
          </div>
          <div className="readiness-card" aria-label="Project readiness">
            <div className="readiness-topline">
              <span>Production readiness</span>
              <strong>32%</strong>
            </div>
            <div className="progress-track" aria-hidden="true"><span style={{ width: "32%" }} /></div>
            <p>Architecture is executable. Voice rights, provider configuration and human calibration remain deliberately unresolved.</p>
          </div>
        </section>

        <section className="metric-grid" aria-label="Foundation capabilities">
          <article className="metric-card"><span>01</span><strong>Exact-source</strong><p>Stable offsets and immutable manuscript fingerprints.</p></article>
          <article className="metric-card"><span>02</span><strong>Series-aware</strong><p>Voice, pronunciation and performance anchors across books.</p></article>
          <article className="metric-card"><span>03</span><strong>Provider-neutral</strong><p>Capability negotiation and explicit fallback routes.</p></article>
          <article className="metric-card"><span>04</span><strong>Review-first</strong><p>Candidate takes, quality findings and non-destructive approval.</p></article>
        </section>

        <section className="panel workflow-panel" id="manuscript">
          <div className="section-heading">
            <div><p className="section-kicker">PRODUCTION SPINE</p><h2>One governed path from text to release</h2></div>
            <p>Each stage has evidence, blockers and an explicit owner. Assignment never implies approval.</p>
          </div>
          <ol className="workflow-list">
            {workflow.map((item, index) => (
              <li key={item.label}>
                <span className="workflow-index">{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{item.label}</strong><p>{item.detail}</p></div>
                <StatePill state={item.state} />
              </li>
            ))}
          </ol>
        </section>

        <div className="two-column" id="direction">
          <section className="panel direction-panel">
            <div className="section-heading compact">
              <div><p className="section-kicker">PERFORMANCE DIRECTION</p><h2>Intent before emotion labels</h2></div>
              <span className="outline-tag">Example segment</span>
            </div>
            <blockquote>
              “Speak from what the character needs from the listener. Do not perform sadness as a surface effect.”
            </blockquote>
            <div className="direction-grid">
              {directionValues.map((item) => (
                <div className="direction-control" key={item.label}>
                  <div><strong>{item.label}</strong><span>{item.value}</span></div>
                  <div className="meter" aria-label={`${item.label}: ${item.value} out of 100`}><span style={{ width: `${item.value}%` }} /></div>
                  <p>{item.note}</p>
                </div>
              ))}
            </div>
            <div className="direction-note">
              <span>Subtext</span>
              <p>The speaker is seeking permission while pretending the decision has already been made.</p>
            </div>
          </section>

          <aside className="panel review-panel" id="voices">
            <div className="section-heading compact"><div><p className="section-kicker">REVIEW QUEUE</p><h2>Blocked honestly</h2></div><strong>3</strong></div>
            <div className="review-list">
              {reviewItems.map((item) => (
                <article key={item.title} className={`review-item review-${item.tone}`}>
                  <span className="review-indicator" />
                  <div><strong>{item.title}</strong><p>{item.detail}</p></div>
                </article>
              ))}
            </div>
          </aside>
        </div>

        <section className="panel" id="takes">
          <div className="section-heading">
            <div><p className="section-kicker">TAKE QUALITY</p><h2>Choose the best performance, not the first file</h2></div>
            <p>Automated checks reject objective defects. Human review remains authoritative for dramatic truth, taste and authorial voice.</p>
          </div>
          <div className="qa-table" role="table" aria-label="Take quality gates">
            {qaGates.map(([name, state, description]) => (
              <div className="qa-row" role="row" key={name}>
                <strong role="cell">{name}</strong>
                <span role="cell">{state}</span>
                <p role="cell">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="visual-section" id="visuals">
          <div className="visual-copy">
            <p className="section-kicker">ILLUSTRATED STORY COMPANION</p>
            <h2>Atmosphere, continuity and deliberate motion.</h2>
            <p>
              The visual engine plans scenes and dramatic beats rather than generating a disposable image for every sentence.
              Character, location, costume, light, composition and period decisions are locked in a visual bible before rendering.
            </p>
            <div className="visual-rules">
              <span>Scene-level beats</span><span>Layered illustration</span><span>Restrained parallax</span><span>Human art direction</span>
            </div>
          </div>
          <div className="story-frame" aria-label="Abstract visual story frame preview">
            <div className="frame-sky" /><div className="frame-ridge frame-ridge-back" /><div className="frame-ridge frame-ridge-front" />
            <div className="frame-window"><span /></div>
            <div className="frame-caption"><span>BEAT 07</span><p>Hold on the empty window after the voice stops.</p></div>
          </div>
        </section>

        <footer id="delivery">
          <div><strong>EVAVO Storyteller Studio</strong><p>Structure first. Direction before generation. Evidence before release.</p></div>
          <span>Foundation 0.2.0</span>
        </footer>
      </main>
    </div>
  );
}
