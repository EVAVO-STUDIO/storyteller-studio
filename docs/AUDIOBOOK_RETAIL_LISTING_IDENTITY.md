# Governed audiobook retail listing identity

Retailer acceptance of an audiobook submission does not prove that the intended title, credits, cover, description or linked eBook will appear correctly in a public store. The listing-identity boundary establishes the exact public identity that a later publication-verification stage must observe.

## Admission boundary

A listing identity requires the exact current chain:

```text
approved audiobook package manifest
  + current retail listing policy
  + approved opening credit
  + approved closing credit
  + canonical credit metadata
  + current audiobook rights
  + verified and approved cover artifact
  + independent cover-compliance evidence
  + current cover rights
  + current Amazon eBook availability evidence
  + editorial listing review
  + rights listing review
  + merchandising listing review
  + independent publisher approval
  -> approved-for-publication-verification
```

Each source is validated at creation and again at final approval. Matching object shapes or locally recomputed fingerprints cannot replace the approved sources.

## Canonical public metadata

The identity records the intended public:

- title and display title;
- optional subtitle;
- author credit;
- narrator credit;
- publisher name;
- language tag;
- product description;
- standalone or series identity;
- optional series title and volume number;
- copyright notice;
- optional production credit.

The display title, author and narrator must reproduce the metadata that generated the exact approved spoken opening and closing credits. The engine regenerates both credit scripts from the supplied metadata and policy, then compares their metadata and text hashes with the approved records.

This prevents a listing title or contributor name from drifting away from the audio already reviewed in the audiobook package.

## Retail listing policy

The first policy is scoped to `acx-audible` and captures a reviewed external-policy version with an expiry date.

The governed requirements include:

- product descriptions of no more than 2,000 characters;
- title, author and narrator alignment with spoken credits;
- cover title and author alignment with listing metadata;
- a linked eBook that remains available on Amazon;
- a square cover of at least 2400 by 2400 pixels;
- JPEG, PNG or TIFF cover format;
- at least 72 DPI;
- at least 24-bit RGB colour;
- a maximum cover size of 8 MB;
- confirmation that prohibited cover elements are absent.

The policy expires within one year and must be reviewed again rather than silently treated as permanent.

## Cover evidence

The cover must already be a verified and human-approved `visual-render` artifact with current commercial audiobook rights.

A separate human observer confirms:

- dimensions;
- square aspect ratio;
- colour space;
- bit depth;
- DPI;
- title text;
- author text;
- absence of prohibited elements.

The cover evidence binds the immutable artifact identifier, revision, fingerprint, content hash, byte count and rights fingerprint. The listing identity additionally requires the observed title and author to equal its canonical public metadata.

Private storage paths and raw artwork bytes are not placed in the listing identity.

## eBook availability evidence

The eBook record contains:

- exact project and book scope;
- Amazon marketplace;
- the public ASIN;
- a one-way product-reference hash;
- an independent human observer;
- observation and expiry times;
- an explicit available state.

Evidence may remain current for no more than 31 days. Expired evidence cannot create or approve a listing identity.

No Amazon credentials, session data or raw product URL is stored.

## Independent review

Three human roles are required.

### Editorial

Editorial review confirms:

- title, author and narrator match the approved spoken credits;
- description accuracy;
- language;
- standalone or series metadata.

### Rights

Rights review confirms:

- audiobook rights remain current;
- cover rights remain current;
- copyright notice;
- eBook association.

### Merchandising

Merchandising review confirms:

- cover technical compliance;
- cover text matching;
- description length;
- absence of prohibited cover elements;
- eBook availability.

The three reviewers must be different people. A changes-requested decision remains blocking until that role submits a clean later review.

## Publisher approval

A fourth human grants final approval.

That person must be independent from:

- all three listing reviewers;
- the opening-credit approver;
- the closing-credit approver;
- the cover observer;
- the eBook observer.

Worker, bot, automated and system identities are rejected.

Final approval revalidates every source and produces only:

`approved-for-publication-verification`

## Persistence and audit

The identity is revisioned and fingerprinted. Repeating an identical create is idempotent. Updates require the exact current revision and previous fingerprint.

Audit metadata is aggregate-only. It records status, project kind, description length, review count, reviewer count, finding count, media-file count, cover format, eBook availability and publication-verification eligibility.

It omits public-copy internals, source hashes, evidence identities, rights records, reviewer identities and confirmation identifiers.

## Public projection

The public projection exposes the intended retail metadata because that material is designed to become public. It also exposes safe cover dimensions and format, Amazon ASIN, review summary, status and fingerprint.

It omits:

- project and package identifiers;
- package, credit, cover and eBook evidence identifiers;
- content, artifact, policy and rights fingerprints;
- product-reference hashes;
- private storage information;
- reviewer, observer and approver identities;
- final confirmation identifiers;
- source-set and reviewer-set fingerprints.

## Output boundary

`approved-for-publication-verification` means the intended listing identity is governed and ready to be compared with an externally observed public listing.

It does not mean the audiobook is published, live, playable, regionally available, purchasable, on sale or accepted for public distribution.

The next stage must independently observe the public retailer listing, compare its title, credits, cover, description and eBook identity with this record, verify playback and availability, and retain external evidence before any live or on-sale state can be claimed.
