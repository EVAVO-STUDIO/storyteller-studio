const workflow = [
  { label: "Manuscript", detail: "Immutable source and chapter map", state: "ready" },
  { label: "Story bible", detail: "Characters, places and pronunciations", state: "review" },
  { label: "Direction", detail: "Narrative stance and dramatic beats", state: "active" },
  { label: "Calibration", detail: "Varied passages, blind review and continuity lock", state: "review" },
  { label: "Production", detail: "Candidate generation through a leased worker", state: "waiting" },
  { label: "Artifact register", detail: "Integrity, provenance, rights and review state", state: "waiting" },
  { label: "Mastering", detail: "Approved dependencies and chapter assembly", state: "waiting" },
  { label: "Release", detail: "Final confirmation over the verified package", state: "waiting" },
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

const calibrationPosture = [
  {
    label: "Passages",
    value: "Varied by risk",
    detail: "Quiet intimacy, dialogue, long syntax, pressure, exposition, endings and pronunciation.",
    tone: "ready",
  },
  {
    label: "Reviews",
    value: "Blind + independent",
    detail: "Revise and reject decisions cannot be averaged away by stronger scores.",
    tone: "review",
  },
  {
    label: "Continuity",
    value: "One approved lock",
    detail: "Voice revision, provider, model and capability snapshot must remain consistent.",
    tone: "ready",
  },
  {
    label: "HTTP surface",
    value: "Redacted reads only",
    detail: "No candidate, review, selection, approval or rejection mutation endpoint.",
    tone: "private",
  },
];

const calibrationStages = [
  {
    index: "01",
    label: "Propose passages",
    state: "Implemented",
    tone: "ready",
    detail: "Select distinct manuscript risks without copying prose into the calibration record.",
  },
  {
    index: "02",
    label: "Generate candidates",
    state: "Blocked",
    tone: "blocked",
    detail: "Requires rights-valid material, provider preflight, budget reservation and private storage.",
  },
  {
    index: "03",
    label: "Blind review",
    state: "Internal",
    tone: "review",
    detail: "Independent human reviewers score long-form performance dimensions and explicit decisions.",
  },
  {
    index: "04",
    label: "Select references",
    state: "Human",
    tone: "review",
    detail: "Choose one eligible take for every required passage; assignment never implies approval.",
  },
  {
    index: "05",
    label: "Approve continuity",
    state: "Waiting",
    tone: "blocked",
    detail: "A named human locks the approved voice revision and provider capability evidence.",
  },
];

const calibrationDimensions = [
  ["Listener relationship", "Required"],
  ["Textual truth", "Required"],
  ["Clarity + rhythm", "Per-dimension floor"],
  ["Emotional truth", "Without display"],
  ["Restraint", "Independent score"],
  ["Sustained listenability", "Long-form gate"],
  ["Differentiation", "Intent before accent"],
  ["Pronunciation", "Approved canon"],
];

const artifactPosture = [
  {
    label: "Registry",
    value: "Disabled by default",
    detail: "A storage driver must be selected explicitly.",
    tone: "safe",
  },
  {
    label: "HTTP surface",
    value: "Read only",
    detail: "Authenticated status and evidence views only.",
    tone: "safe",
  },
  {
    label: "Worker writes",
    value: "Internal only",
    detail: "No normal browser or operator write endpoint.",
    tone: "review",
  },
  {
    label: "Release",
    value: "Final confirmation",
    detail: "Never implied by generation or review alone.",
    tone: "blocked",
  },
];

const artifactStages = [
  {
    index: "01",
    label: "Register",
    state: "Implemented",
    tone: "ready",
    detail: "Record SHA-256, byte count, format, private storage reference, provenance and rights.",
  },
  {
    index: "02",
    label: "Verify",
    state: "Implemented",
    tone: "ready",
    detail: "Confirm immutable bytes, media structure, transcript fidelity, engineering and safety evidence.",
  },
  {
    index: "03",
    label: "Review",
    state: "Gated",
    tone: "review",
    detail: "Human creative approval begins only after objective verification succeeds.",
  },
  {
    index: "04",
    label: "Assemble",
    state: "Waiting",
    tone: "waiting",
    detail: "Build chapter masters from approved takes through a traceable dependency graph.",
  },
  {
    index: "05",
    label: "Release",
    state: "Blocked",
    tone: "blocked",
    detail: "Require verified, reviewed and rights-valid dependencies plus a final confirmation.",
  },
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
          <span className="environment-badge">Governed foundation</span>
          <button
            className="quiet-button"
            type="button"
            disabled
            title="Deployment and signed launch are not configured"
          >
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
          <a className="nav-item" href="#calibration"><span>CA</span>Calibration</a>
          <a className="nav-item" href="#takes"><span>TK</span>Takes</a>
          <a className="nav-item" href="#artifacts"><span>AR</span>Artifacts</a>
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
            <p className="eyebrow">DEMONSTRATION WORKSPACE · NO PRIVATE MANUSCRIPT OR GENERATED MEDIA LOADED</p>
            <h1>Direct the performance.<br />Protect the story.</h1>
            <p className="project-summary">
              A review-first production workspace for narration that preserves the author’s language,
              carries emotional intention and stays recognisably consistent across a complete series.
            </p>
          </div>
          <div className="readiness-card" aria-label="Project readiness">
            <div className="readiness-topline">
              <span>Production readiness</span>
              <strong>41%</strong>
            </div>
            <div className="progress-track" aria-hidden="true"><span style={{ width: "41%" }} /></div>
            <p>Queue, artifacts and calibration governance are executable. Voice rights, a live provider, object storage and an actual human-approved session remain deliberately unresolved.</p>
          </div>
        </section>

        <section className="metric-grid" aria-label="Foundation capabilities">
          <article className="metric-card"><span>01</span><strong>Exact-source</strong><p>Stable offsets and immutable manuscript fingerprints.</p></article>
          <article className="metric-card"><span>02</span><strong>Series-aware</strong><p>Voice, pronunciation and performance anchors across books.</p></article>
          <article className="metric-card"><span>03</span><strong>Calibration-gated</strong><p>Varied passages, blind review and sustained-listening approval.</p></article>
          <article className="metric-card"><span>04</span><strong>Artifact-governed</strong><p>Verification, human approval and final release remain separate.</p></article>
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

        <section className="panel calibration-panel" id="calibration" aria-labelledby="calibration-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">NARRATION CALIBRATION</p>
              <h2 id="calibration-heading">Prove the voice over time, not in ten seconds</h2>
            </div>
            <p>
              A technically clean sample can still become repetitive, overperformed or tiring across a chapter.
              Calibration evaluates varied prose, independent human judgement and one consistent production configuration.
            </p>
          </div>

          <div className="calibration-posture-grid" aria-label="Calibration governance posture">
            {calibrationPosture.map((item) => (
              <article className="calibration-posture-card" data-tone={item.tone} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>

          <div className="calibration-body">
            <ol className="calibration-flow" aria-label="Calibration lifecycle">
              {calibrationStages.map((item) => (
                <li key={item.label}>
                  <span className="calibration-flow-index">{item.index}</span>
                  <div><strong>{item.label}</strong><p>{item.detail}</p></div>
                  <span className="calibration-flow-state" data-tone={item.tone}>{item.state}</span>
                </li>
              ))}
            </ol>

            <aside className="calibration-dimensions" aria-labelledby="calibration-dimensions-heading">
              <div className="calibration-dimensions-header">
                <span>HUMAN SCORECARD</span>
                <h3 id="calibration-dimensions-heading">No single naturalness score</h3>
              </div>
              <ul className="calibration-dimension-list">
                {calibrationDimensions.map(([label, rule]) => (
                  <li key={label}><strong>{label}</strong><span>{rule}</span></li>
                ))}
              </ul>
            </aside>
          </div>

          <div className="calibration-guardrail">
            <span className="calibration-guardrail-mark">!</span>
            <div>
              <strong>No calibration session loaded</strong>
              <p>The authenticated read API is available when configured. Candidate, review, selection and approval mutations remain internal and require explicit human confirmation.</p>
            </div>
            <span>Read only</span>
          </div>
        </section>

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

        <section className="panel artifact-panel" id="artifacts" aria-labelledby="artifact-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">GOVERNED PRODUCTION ARTIFACTS</p>
              <h2 id="artifact-heading">A file exists only after its evidence exists</h2>
            </div>
            <p>
              Generation intent, stored media, human approval and final release are separate states.
              A provider response never becomes an approved audiobook by implication.
            </p>
          </div>

          <div className="artifact-posture-grid" aria-label="Artifact runtime posture">
            {artifactPosture.map((item) => (
              <article className="artifact-posture-card" data-tone={item.tone} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>

          <ol className="artifact-flow" aria-label="Artifact lifecycle">
            {artifactStages.map((item) => (
              <li key={item.label}>
                <div className="artifact-stage-top">
                  <span className="artifact-stage-index">{item.index}</span>
                  <span className="artifact-stage-state" data-tone={item.tone}>{item.state}</span>
                </div>
                <h3>{item.label}</h3>
                <p>{item.detail}</p>
              </li>
            ))}
          </ol>

          <div className="artifact-guardrail">
            <span className="artifact-guardrail-mark">!</span>
            <div>
              <strong>No generated media registered</strong>
              <p>This demonstration exposes no private object keys, signed URLs, provider request identifiers or worker lease material.</p>
            </div>
            <span>Fail closed</span>
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
