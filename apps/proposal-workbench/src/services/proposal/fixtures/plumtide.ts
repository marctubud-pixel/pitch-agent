/**
 * Packaging demo: Plumtide, a new sparkling plum drink from the (fictional) Oriya family.
 * A new product, so research leans on chiller conventions, packaging comparisons and how the
 * cans are shared and gifted. Assisted mode; paused at the visual-development checkpoint.
 *
 * The brief calls the drink "light" and the audience "young". Neither is turned into a strength
 * or an age range: both stay open questions. Claim references point at Workbench `plumtide`.
 */
import type { CanDesign, Proposal } from '../../../domain/proposal';
import { avg, brief, chart, claim, COBALT_STYLE, EDITORIAL_STYLE, kase, STUDIO_STYLE, LEADS, mock, pack, scene, scores, stage } from './helpers';

const INK: CanDesign = { base: '#f3ead8', ink: '#1f1a1c', accent: '#b8323f', pattern: 'plum-ink', wordmark: 'Plumtide', flavour: 'Sparkling plum' };
const BUBBLE: CanDesign = { base: '#7a2346', ink: '#fff4f6', accent: '#f2b8c6', pattern: 'bubbles', wordmark: 'Plumtide', flavour: 'Sparkling plum' };
const PANO = (panel: 0 | 1 | 2 | 3): CanDesign => ({ base: '#f6dccb', ink: '#2b1d2a', accent: '#b8323f', pattern: 'panorama', wordmark: 'Plumtide', flavour: 'Sparkling plum', panel });

const COMPETITOR = ['#2a1530', '#4b1f45', '#6d2a4f', '#8c2f43', '#d9c3d3', '#120a14'];
const ROOF = ['#f6c6a8', '#e58f73', '#9d4f63', '#4c2b45', '#ffe2a8', '#22171f'];
const BLOSSOM = ['#f6eddc', '#e9b9c2', '#c25b6c', '#5a2a3a', '#b8323f', '#1f1a1c'];

const sA = scores(['Concept', 4.2], ['Plum reads at a glance', 4.4], ['Shelf stand-out', 3.9], ['Oriya belonging', 4.8], ['Gift presentability', 4.1]);
const sB = scores(['Concept', 4.1], ['Plum reads at a glance', 4.3], ['Shelf stand-out', 4.5], ['Oriya belonging', 3.7], ['Gift presentability', 3.9]);
const sC = scores(['Concept', 4.6], ['Plum reads at a glance', 4.0], ['Shelf stand-out', 4.3], ['Oriya belonging', 4.0], ['Gift presentability', 4.7]);

const tA = scores(['Clarity and memorability', 4.2], ['Brand and product integration', 4.7], ['Audience resonance', 3.6], ['Differentiation', 3.8], ['Relevance to current communication', 3.5]);
const tB = scores(['Clarity and memorability', 4.4], ['Brand and product integration', 4.0], ['Audience resonance', 4.0], ['Differentiation', 4.2], ['Relevance to current communication', 4.3]);
const tC = scores(['Clarity and memorability', 4.5], ['Brand and product integration', 4.0], ['Audience resonance', 4.7], ['Differentiation', 4.6], ['Relevance to current communication', 4.5]);

const panoramaSleeve = pack('four-pack', 'front', PANO(0));

export const plumtide: Proposal = {
  id: 'plumtide-pack',
  workbenchId: 'plumtide',
  name: 'Plumtide — can and gift sleeve',
  client: 'Oriya Drinks (fictional)',
  type: 'packaging',
  summary: 'Packaging for a new sparkling plum drink: a can for the chiller and a four-can New Year gift sleeve.',
  cover: pack('can', 'three-quarter', PANO(1)),
  mode: 'assisted',
  checkpoints: ['strategy', 'themes', 'visual', 'delivery'],
  currentStage: 'visual',
  stages: {
    brief: stage('done', 'Task card confirmed. Strength, size, materials and age range stay open questions.', LEADS.brief, '2026-10-18T06:30:00Z'),
    research: stage('done', 'Research released after agent verification, sufficiency review and handoff checks.', LEADS.research, '2026-10-20T03:00:00Z'),
    strategy: stage('done', 'You approved: a light, illustrated plum can that belongs on a shared table.', LEADS.strategy, '2026-10-21T08:00:00Z'),
    themes: stage('done', 'You approved three directions and added a furoshiki reference for the sleeve.', LEADS.themes, '2026-10-22T07:30:00Z'),
    visual: stage('waiting_for_you', 'A and B passed review. C’s refined concept is ready — waiting for your decision.', LEADS.visual, '2026-10-24T09:40:00Z'),
    content_review: stage('not_started', 'Starts after you sign off visual development.', LEADS.content_review, null),
    layout: stage('not_started', 'Starts after the content review.', LEADS.layout, null),
    delivery: stage('not_started', 'Final review and the editable deck.', LEADS.delivery, null),
  },
  task: {
    assignment: 'Can packaging and a four-can New Year gift sleeve for Plumtide, a new sparkling plum drink.',
    output: 'Three packaging directions with can views and a gift sleeve, conceptual mockups and an editable deck.',
    occasion: 'Shared get-togethers, and New Year gifting',
    scope: ['Can: front, three-quarter and back views', 'Four-can gift sleeve', 'Conceptual mockups: chiller shelf, gift table, in hand', 'Editable presentation deck'],
    inputs: [
      { id: 'pi1', kind: 'pdf', title: 'Oriya brand book.pdf', note: 'Client document: plum-branch brush mark, family seal, palette.' },
      { id: 'pi2', kind: 'image', title: 'Oriya plum-wine bottle label', note: 'Parent-brand label for reference.', art: scene('plum-ink', BLOSSOM, { seed: 2 }) },
      { id: 'pi3', kind: 'link', title: 'Retailer gifting calendar', note: 'Sample link. Gift sleeves stocked from mid-December.' },
    ],
    unknowns: [
      { id: 'pu1', topic: 'Alcohol content', why: '“Light” in the brief describes taste and mood. It does not state strength, so none is assumed. Asked the client.' },
      { id: 'pu2', topic: 'Age range', why: '“Young” is not an age band. If the drink contains alcohol, legal-age rules apply on top.' },
      { id: 'pu3', topic: 'Who buys the gift sleeve', why: 'Gift buyers, drinkers and the people the drink is shared with may all differ. The brief does not say.' },
      { id: 'pu4', topic: 'Can size, materials and finishes', why: 'Not specified. Concept views use a standard slim can shape for illustration only.' },
    ],
  },
  research: {
    adaptation:
      'A new product and its packaging: the research leans on chiller conventions, packaging comparisons and how cans are shared and gifted. Brand history comes from the parent, Oriya, so it gets one short section.',
    summary:
      'Every plum can in the chiller is dark purple with fruit photography. Gift sleeves sell when they look presentable unwrapped. Cans are shared at get-togethers, where looking good on the table matters. Plum blossom already means New Year.',
    sections: [
      {
        id: 'brand',
        title: 'Oriya and the new product',
        summary: 'Plumtide inherits Oriya’s brushed plum branch and family seal. What the drink is — strength, size — is not confirmed yet.',
        findings: [
          { id: 'pb1', kind: 'evidence', text: 'Oriya labels use a hand-brushed plum branch, the family seal and a cream, ink and plum-red palette.', claimRef: 'c4', note: null },
          { id: 'pb2', kind: 'unverified', text: 'Plumtide’s alcohol content.', claimRef: null, note: 'Not in the brief. “Light” describes mood, not strength. Not used anywhere in the work.' },
        ],
        groups: [
          {
            id: 'pg-oriya',
            title: 'Oriya labels today',
            kind: 'background',
            takeaway: 'Brush, seal, cream ground: the family look Plumtide can borrow from or move away from.',
            items: [
              { id: 'pk-label1', title: 'Plum wine, classic', caption: 'Brush branch on cream.', art: scene('plum-ink', BLOSSOM, { seed: 2 }), source: 'Client brand book (illustration)', date: '2025', applicability: 'Direct: parent-brand assets.', limitation: null },
              { id: 'pk-label2', title: 'Plum wine, reserve', caption: 'Seal-led label.', art: scene('plum-ink', ['#1f1a1c', '#3a2a2e', '#b8323f', '#f3ead8', '#d9a441', '#f3ead8'], { seed: 6 }), source: 'Client brand book (illustration)', date: '2024', applicability: 'Direct.', limitation: null },
            ],
          },
        ],
        chart: null,
      },
      {
        id: 'category',
        title: 'Chiller conventions and competitors',
        summary: 'Plum competitors look alike: dark purple cans with fruit photography. A lighter, illustrated can would stand apart — as long as plum still reads at a glance.',
        findings: [
          { id: 'pc1', kind: 'evidence', text: 'Plum sparkling competitors use dark purple or deep red cans with fruit photography.', claimRef: 'c1', note: null },
          { id: 'pc2', kind: 'evidence', text: 'Gift sleeves are stocked from mid-December and chosen when they look presentable without wrapping.', claimRef: 'c2', note: null },
        ],
        groups: [
          {
            id: 'pg-competitors',
            title: 'Plum cans in the chiller',
            kind: 'comparison',
            takeaway: 'Three brands, one look. Dark grounds and fruit photos blur together at the chiller door.',
            items: [
              { id: 'pk-shelf', title: 'Chiller, store 3', caption: 'Plum cans grouped together.', art: scene('chiller', COMPETITOR, { seed: 3 }), source: 'Chiller audit (sample field notes)', date: 'Oct 2026', applicability: 'Direct comparison.', limitation: 'Six stores in one city.' },
              { id: 'pk-flat', title: 'Competitor can fronts', caption: 'Fruit photography on dark purple.', art: scene('shelf-lineup', COMPETITOR, { seed: 4 }), source: 'Desk review (demo illustration)', date: 'Oct 2026', applicability: 'Direct comparison.', limitation: null },
              { id: 'pk-photo', title: 'Typical plum photo', caption: 'Halved plum, water drops.', art: scene('fruit-flatlay', COMPETITOR, { seed: 1 }), source: 'Desk review (demo illustration)', date: 'Oct 2026', applicability: 'Direct comparison.', limitation: null },
            ],
          },
        ],
        chart: {
          id: 'ch-colour',
          kind: 'bar',
          title: 'Main can colour of plum competitors',
          measure: 'Can fronts counted across six chillers',
          data: [
            { label: 'Dark purple', value: 7, highlight: true },
            { label: 'Deep red', value: 3 },
            { label: 'Light or cream', value: 1 },
            { label: 'Other', value: 1 },
          ],
          note: 'Sample field notes. Illustrative demo data.',
          demoData: true,
        },
      },
      {
        id: 'audience',
        title: 'Who drinks, who buys, who gifts',
        summary: 'Drinkers bring cans to share at get-togethers. Gift sleeves may be bought by someone else. The can and the sleeve are judged as separate jobs.',
        findings: [
          { id: 'pa1', kind: 'evidence', text: 'Participants bring drinks to share at get-togethers and value cans that look good on the table.', claimRef: 'c3', note: null },
          { id: 'pa2', kind: 'unverified', text: 'Gift sleeves are often bought by someone other than the drinker.', claimRef: null, note: 'A common pattern, but not in our sources for this audience. Kept as a question, not a finding.' },
        ],
        groups: [
          {
            id: 'pg-moments',
            title: 'Get-together moments',
            kind: 'background',
            takeaway: 'Illustrations of interview themes: cans passed around, set on a table, carried up to a rooftop.',
            items: [
              { id: 'pk-roof', title: 'Rooftop at dusk', caption: 'Cans passed along the bench.', art: scene('rooftop', ROOF, { seed: 2 }), source: 'Get-together interviews (sample notes)', date: 'Oct 2026', applicability: 'Occasion; qualitative.', limitation: 'One interview round.' },
              { id: 'pk-table', title: 'The shared table', caption: '“It should look nice when it’s out.”', art: scene('gift-wrap', ['#f3ead8', '#e8c9a8', '#b8323f', '#5a2a3a', '#d9a441', '#1f1a1c'], { seed: 3 }), source: 'Get-together interviews (sample notes)', date: 'Oct 2026', applicability: 'Occasion; qualitative.', limitation: null },
            ],
          },
        ],
        chart: {
          id: 'ch-who',
          kind: 'split',
          title: 'Who brought the drinks',
          measure: 'Get-togethers described in interviews (n = 10)',
          data: [
            { label: 'Guests brought them', value: 6, highlight: true },
            { label: 'The host bought them', value: 4 },
          ],
          note: 'Sample interview notes. Illustrative demo data.',
          demoData: true,
        },
      },
      {
        id: 'context',
        title: 'New Year and the season',
        summary: 'Plum blossom is an established New Year motif. On the gift sleeve it should live inside the illustration, not only in a greeting.',
        findings: [{ id: 'px1', kind: 'evidence', text: 'Plum blossom is a common New Year motif, tied to the first flowers of the year.', claimRef: 'c5', note: null }],
        groups: [
          {
            id: 'pg-inspiration',
            title: 'Cross-industry inspiration',
            kind: 'inspiration',
            takeaway: 'Ideas for treatment — glass gradients, cloth wrapping, lantern light. Not evidence of what the audience prefers.',
            items: [
              { id: 'pk-glass', title: 'Fragrance bottle gradient', caption: 'Colour rising through glass.', art: scene('perfume-glass', ['#f6e3ea', '#e9a6bb', '#b8476c', '#5a1f3a', '#fff4f6', '#2b1020'], { seed: 2 }), source: 'Beauty packaging (demo illustration)', date: '2026', applicability: 'Inspiration: gradient as movement.', limitation: 'Different category and price point.' },
              { id: 'pk-cloth', title: 'Furoshiki wrapping cloth', caption: 'A knot as the closure.', art: scene('gift-wrap', BLOSSOM, { seed: 5 }), source: 'Craft archive (demo illustration)', date: '—', applicability: 'Inspiration: gift without extra wrapping.', limitation: null },
              { id: 'pk-lantern', title: 'New Year lantern street', caption: 'Warm points of light.', art: scene('festival-lanterns', ['#2b1d2a', '#4c2b45', '#9d4f63', '#e58f73', '#ffd38a', '#120a14'], { seed: 1 }), source: 'Street photography (demo illustration)', date: '—', applicability: 'Inspiration: seasonal light.', limitation: 'Mood only.' },
            ],
          },
        ],
        chart: null,
      },
    ],
  },
  strategy: {
    question: 'How can a new plum drink be picked first in a crowded purple chiller — and given as a New Year gift — while clearly belonging to Oriya?',
    structure: 'sequential',
    circles: {
      category: {
        title: 'Category: a wall of dark purple',
        points: [
          { text: 'Every plum competitor uses dark grounds and fruit photography.', evidence: [claim('c1', 'Chiller audit'), chart('ch-colour', 'Can colours')] },
          { text: 'Gift sleeves sell when they look presentable unwrapped.', evidence: [claim('c2', 'Gifting guide')] },
        ],
      },
      brand: {
        title: 'Oriya: brush, seal, cream',
        points: [
          { text: 'A brushed plum branch and the family seal are recognisable assets.', evidence: [claim('c4', 'Brand book'), kase('pk-label1', 'Oriya label')] },
          { text: 'Strength and size are unconfirmed; nothing on pack can imply them.', evidence: [brief('openQuestions', 'Brief open questions')] },
        ],
      },
      audience: {
        title: 'Drinkers share; gift buyers may differ',
        points: [
          { text: 'Cans are brought to share and should look good on the table.', evidence: [claim('c3', 'Interviews'), chart('ch-who', 'Who brought drinks')] },
          { text: 'Plum blossom already says New Year.', evidence: [claim('c5', 'New Year motifs')] },
        ],
      },
    },
    intersection: {
      insight: 'A light, illustrated plum can that looks like it belongs on a shared table — and lines up into a gift.',
      why: 'The chiller is dark and photographic; Oriya is brushed and cream; drinkers judge cans on the table, gift buyers judge sleeves unwrapped.',
    },
    argument: [
      { step: 'Dark and photographic is the category’s default.', detail: 'Standing out means going light and illustrated — if plum still reads at a glance.', evidence: [claim('c1', 'Chiller audit')] },
      { step: 'Oriya gives Plumtide an illustrated language to start from.', detail: 'Brush branch, seal and cream are owned assets.', evidence: [claim('c4', 'Brand book')] },
      { step: 'The can is judged on a shared table, the sleeve unwrapped.', detail: 'Two jobs, two audiences, one system.', evidence: [claim('c3', 'Interviews'), claim('c2', 'Gifting guide')] },
      { step: 'Plum blossom bridges the can and the New Year sleeve.', detail: 'The season can live inside the illustration.', evidence: [claim('c5', 'New Year motifs')] },
    ],
    conclusion: 'Go light and illustrated where competitors are dark and photographic, and design the can and the sleeve as one system.',
    answer: 'Plumtide is picked first because it is the only light, illustrated plum can in the chiller, belongs to Oriya through the brush and seal, and becomes a gift when four cans line up.',
    opportunities: [
      { id: 'po1', title: 'A new branch of the orchard', idea: 'Take Oriya’s brushed plum branch onto a cream can.', because: 'Owned brand assets; opposite of the dark category.', evidence: [claim('c4', 'Brand book'), claim('c1', 'Chiller audit')], leadsTo: 'A' },
      { id: 'po2', title: 'Sparkle made visible', idea: 'Turn the carbonation into the pattern of the can.', because: 'The product’s one new characteristic for Oriya.', evidence: [kase('pk-glass', 'Gradient inspiration')], leadsTo: 'B' },
      { id: 'po3', title: 'Four cans, one picture', idea: 'Four cans that join into one get-together scene on the gift sleeve.', because: 'Sharing is how the drink is used; the sleeve must look presentable unwrapped.', evidence: [claim('c3', 'Interviews'), claim('c2', 'Gifting guide')], leadsTo: 'C' },
    ],
  },
  themes: {
    copyDirection: 'Warm and light, never about strength or effect. Short lines that work on a can at arm’s length.',
    historicalNote: 'Oriya’s labels use one short poetic line. We kept a single line per direction but did not copy the classical tone.',
    directions: [
      {
        id: 'A',
        mechanism: 'evolution',
        name: 'Ink orchard',
        slogan: 'A new branch of an old orchard.',
        subline: 'Plumtide, from the Oriya family.',
        rationale: 'Carries Oriya’s brushed branch and seal onto a cream can, so the new drink is clearly family.',
        connections: { brand: 'Uses the parent brand’s own marks.', audience: 'Calm and giftable on a table.', assignment: 'Belongs to Oriya at first sight.' },
        difference: 'The only direction that leads with heritage.',
        copyLines: ['A new branch of an old orchard.', 'From the Oriya family. Lightly sparkling.'],
        color: '#b8323f',
        scores: tA,
        challenges: [{ claim: 'Brand integration 4.7', challenge: 'Heritage cues may read as plum wine, not a new sparkling drink.', resolution: 'Add a sparkle line under the branch; keep the can light.', outcome: 'partly_upheld' }],
        brandView: 'Strongest family resemblance.',
        audienceView: 'Elegant, but may feel like a parent’s drink.',
        reviewOutcome: 'passed',
        disposition: 'kept',
      },
      {
        id: 'B',
        mechanism: 'product',
        name: 'Rising plum',
        slogan: 'Plum that won’t sit still.',
        subline: 'Sparkling plum by Oriya.',
        rationale: 'Makes the carbonation visible: bubbles rise from deep plum into blossom pink, so the can moves even standing still.',
        connections: { brand: 'Oriya’s plum red, made lively.', audience: 'Energetic without claims about effect.', assignment: 'Stand-out in the chiller.' },
        difference: 'The only direction where the product’s sparkle is the design.',
        copyLines: ['Plum that won’t sit still.', 'Lightly sparkling plum.'],
        color: '#7a2346',
        scores: tB,
        challenges: [{ claim: 'Shelf stand-out', challenge: 'A dark plum base sits close to competitors’ purple.', resolution: 'Gradient turns pink in the top half, where eyes land in the chiller.', outcome: 'upheld' }],
        brandView: 'Further from Oriya; needs the seal prominent.',
        audienceView: 'Lively and modern.',
        reviewOutcome: 'passed_with_notes',
        disposition: 'kept',
      },
      {
        id: 'C',
        mechanism: 'audience',
        name: 'Pass it on',
        slogan: 'Four cans. One picture. Pass it on.',
        subline: 'The Plumtide gift sleeve — sparkling plum by Oriya.',
        rationale: 'Each can carries a quarter of a rooftop get-together under a plum tree. Four cans side by side complete the picture — and the gift sleeve shows it whole.',
        connections: { brand: 'Oriya’s plum tree as the centre of the scene.', audience: 'Built around sharing, how the drink is used.', assignment: 'Solves the can and the gift sleeve together.' },
        difference: 'The only direction where the sharing is in the structure of the pack.',
        copyLines: ['Four cans. One picture. Pass it on.', 'Better together. Literally.'],
        color: '#e58f73',
        scores: tC,
        challenges: [{ claim: 'Audience resonance 4.7', challenge: 'A single can in the chiller only shows a quarter of the picture.', resolution: 'Each quarter is a complete small scene: one person, one branch.', outcome: 'partly_upheld' }],
        brandView: 'Fresh for Oriya; the tree keeps the link.',
        audienceView: 'Closest to how they described sharing.',
        reviewOutcome: 'passed',
        disposition: 'recommended',
      },
    ],
    recommendation: { id: 'C', reasons: ['Highest communication score (4.46).', 'Solves the can and the gift sleeve with one idea.', 'Furthest from the dark, photographic chiller.'] },
    directorNote: 'You approved all three and added a furoshiki reference for the sleeve closure. Visual development uses it for C.',
  },
  visual: {
    branches: [
      {
        directionId: 'A',
        search: { seeking: 'Brush and seal on a light ground that still reads as new.', borrow: ['Brush stroke weight', 'Seal as a colour accent', 'Cream space'], notFor: 'Photography of fruit.' },
        references: [
          { id: 'pa-r1', title: 'Oriya classic label', origin: 'task_matched', art: scene('plum-ink', BLOSSOM, { seed: 2 }), borrow: 'The branch and seal.', verdict: 'selected', reason: 'Owned asset.' },
          { id: 'pa-r2', title: 'Tea brand cans', origin: 'task_matched', art: scene('shelf-lineup', ['#f3ead8', '#9fb39a', '#5b7a62', '#2e3d33', '#d9a441', '#1f1a1c'], { seed: 7 }), borrow: 'Light cans in a dark chiller.', verdict: 'selected', reason: 'Shows light grounds hold up on shelf.' },
          { id: 'pa-r3', title: 'Calligraphy poster', origin: 'cross_industry', art: scene('plum-ink', ['#ffffff', '#cccccc', '#1f1a1c', '#1f1a1c', '#b8323f', '#1f1a1c'], { seed: 9 }), borrow: 'Stroke energy.', verdict: 'rejected', reason: 'Too formal for a sparkling drink.' },
          { id: 'pa-r4', title: 'Fruit photo can', origin: 'task_matched', art: scene('fruit-flatlay', COMPETITOR, { seed: 2 }), borrow: '—', verdict: 'rejected', reason: 'The category look we are avoiding.' },
        ],
        referenceNote: 'Two task-matched references selected.',
        sketches: [
          { id: 'pa-s1', title: 'Branch wrapping the can', art: scene('plum-ink', BLOSSOM, { sketch: true, composition: 'wide', seed: 2 }), scores: scores(['Concept', 4.2], ['Composition', 4.3], ['Hierarchy', 4.0], ['Brand and season', 4.6]), verdict: 'selected', reason: 'Reads from every side.' },
          { id: 'pa-s2', title: 'Seal centred', art: scene('plum-ink', BLOSSOM, { sketch: true, composition: 'centered', seed: 2 }), scores: scores(['Concept', 3.6], ['Composition', 3.7], ['Hierarchy', 4.2], ['Brand and season', 4.0]), verdict: 'rejected', reason: 'Looks like a wine label.' },
          { id: 'pa-s3', title: 'Branch from the base', art: scene('plum-ink', BLOSSOM, { sketch: true, composition: 'low-horizon', seed: 2 }), scores: scores(['Concept', 3.9], ['Composition', 3.8], ['Hierarchy', 3.7], ['Brand and season', 4.1]), verdict: 'rejected', reason: 'Flavour name crowded.' },
        ],
        sketchNote: 'Packaging sketches judged on idea, composition, hierarchy and brand/season.',
        refined: [
          {
            version: 1,
            art: pack('can', 'three-quarter', INK),
            explanation: 'Oriya’s brushed branch wraps a cream can; the seal sits beside the flavour name. Light where the chiller is dark.',
            scores: sA,
            requirements: [
              { text: 'Plum identifiable as the flavour', met: true, note: 'Blossom and fruit on the branch.' },
              { text: 'Oriya family seal present', met: true, note: '' },
              { text: 'Nothing implies strength or size', met: true, note: 'No strength cues; can shape illustrative.' },
            ],
            status: 'accepted',
            challenge: null,
          },
        ],
        views: [
          { label: 'Front', art: pack('can', 'front', INK) },
          { label: 'Three-quarter', art: pack('can', 'three-quarter', INK) },
          { label: 'Back', art: pack('can', 'back', INK) },
          { label: 'Gift sleeve', art: pack('four-pack', 'front', INK) },
        ],
        mockups: [{ label: 'Chiller shelf', why: 'Tests stand-out against the dark plum competitors.', art: mock('shelf', pack('can', 'front', INK)) }],
      },
      {
        directionId: 'B',
        search: { seeking: 'Colour that moves, as if the drink is rising.', borrow: ['Gradient direction', 'Bubble scale and spacing'], notFor: 'Generic soda bubbles.' },
        references: [
          { id: 'pb-r1', title: 'Fragrance bottle gradient', origin: 'cross_industry', art: scene('perfume-glass', ['#f6e3ea', '#e9a6bb', '#b8476c', '#5a1f3a', '#fff4f6', '#2b1020'], { seed: 2 }), borrow: 'Colour rising through the container.', verdict: 'selected', reason: 'Gradient as movement.' },
          { id: 'pb-r2', title: 'Bubble pattern study', origin: 'cross_industry', art: scene('bubbles', ['#7a2346', '#a33a5c', '#d16a8a', '#f2b8c6', '#fff4f6', '#2b1020'], { seed: 3 }), borrow: 'Spacing that reads as rising.', verdict: 'selected', reason: 'Makes sparkle visible.' },
          { id: 'pb-r3', title: 'Soda can bubbles', origin: 'task_matched', art: scene('bubbles', ['#1e5aa8', '#3a7bd5', '#7fb2f0', '#d6e8ff', '#ffffff', '#0b1f3a'], { seed: 1 }), borrow: '—', verdict: 'rejected', reason: 'Generic soda language.' },
          { id: 'pb-r4', title: 'Lantern light', origin: 'cross_industry', art: scene('festival-lanterns', ['#2b1d2a', '#4c2b45', '#9d4f63', '#e58f73', '#ffd38a', '#120a14'], { seed: 1 }), borrow: 'Glow.', verdict: 'rejected', reason: 'Seasonal, but competes with the sparkle idea.' },
        ],
        referenceNote: 'Two cross-industry references selected for treatment.',
        sketches: [
          { id: 'pb-s1', title: 'Bubbles rising to pink', art: scene('bubbles', BLOSSOM, { sketch: true, composition: 'low-horizon', seed: 3 }), scores: scores(['Concept', 4.2], ['Composition', 4.1], ['Hierarchy', 4.0], ['Brand and season', 3.8]), verdict: 'selected', reason: 'Movement upward, light where eyes land.' },
          { id: 'pb-s2', title: 'Single giant bubble', art: scene('bubbles', BLOSSOM, { sketch: true, composition: 'close-up', seed: 3 }), scores: scores(['Concept', 3.4], ['Composition', 3.6], ['Hierarchy', 3.8], ['Brand and season', 3.2]), verdict: 'rejected', reason: 'Reads as a plum, not sparkle.' },
          { id: 'pb-s3', title: 'Diagonal stream', art: scene('bubbles', BLOSSOM, { sketch: true, composition: 'diagonal', seed: 3 }), scores: scores(['Concept', 3.9], ['Composition', 3.7], ['Hierarchy', 3.5], ['Brand and season', 3.6]), verdict: 'rejected', reason: 'Fights the wordmark.' },
        ],
        sketchNote: 'Packaging sketches judged on idea, composition, hierarchy and brand/season.',
        refined: [
          {
            version: 1,
            art: pack('can', 'three-quarter', BUBBLE),
            explanation: 'Bubbles rise from deep plum into blossom pink. The top half — where eyes land in a chiller — is the lightest part of the can.',
            scores: sB,
            requirements: [
              { text: 'Plum identifiable as the flavour', met: true, note: 'Colour and the word “plum”.' },
              { text: 'Oriya family seal present', met: true, note: 'Seal moved up for visibility.' },
              { text: 'Nothing implies strength or size', met: true, note: '' },
            ],
            status: 'accepted',
            challenge: { claim: 'Shelf stand-out 4.5', challenge: 'The base is close to competitors’ purple.', resolution: 'Gradient lifted so the top half is pink.', outcome: 'upheld' },
          },
        ],
        views: [
          { label: 'Front', art: pack('can', 'front', BUBBLE) },
          { label: 'Three-quarter', art: pack('can', 'three-quarter', BUBBLE) },
          { label: 'Back', art: pack('can', 'back', BUBBLE) },
          { label: 'Gift sleeve', art: pack('four-pack', 'front', BUBBLE) },
        ],
        mockups: [{ label: 'In hand', why: 'Checks the gradient at arm’s length.', art: mock('hand', pack('can', 'front', BUBBLE)) }],
      },
      {
        directionId: 'C',
        search: { seeking: 'Pictures that only complete when pieces are put together.', borrow: ['Panorama split across objects', 'Flat illustration', 'A wrapped gift without extra paper'], notFor: 'Party photography.' },
        references: [
          { id: 'pc-r1', title: 'Furoshiki wrapping cloth (your reference)', origin: 'cross_industry', art: scene('gift-wrap', BLOSSOM, { seed: 5 }), borrow: 'The knot as the sleeve’s closure, as you asked.', verdict: 'selected', reason: 'You supplied this; it solves “presentable unwrapped”.' },
          { id: 'pc-r2', title: 'Rooftop get-together', origin: 'task_matched', art: scene('rooftop', ROOF, { seed: 2 }), borrow: 'The scene itself.', verdict: 'selected', reason: 'From the interview themes.' },
          { id: 'pc-r3', title: 'Puzzle box packaging', origin: 'cross_industry', art: scene('gift-wrap', ['#e9eef2', '#9fb7c9', '#3f5d77', '#1d2a36', '#e9b44c', '#1d2a36'], { seed: 8 }), borrow: 'Pieces joining.', verdict: 'rejected', reason: 'Feels like a toy.' },
          { id: 'pc-r4', title: 'Lantern street', origin: 'cross_industry', art: scene('festival-lanterns', ['#2b1d2a', '#4c2b45', '#9d4f63', '#e58f73', '#ffd38a', '#120a14'], { seed: 4 }), borrow: 'Seasonal light.', verdict: 'rejected', reason: 'Too busy behind the scene.' },
        ],
        referenceNote: 'Your furoshiki reference is used for the sleeve closure.',
        sketches: [
          { id: 'pc-s1', title: 'Rooftop panorama across four cans', art: scene('rooftop', ROOF, { sketch: true, composition: 'wide', seed: 2 }), scores: scores(['Concept', 4.6], ['Composition', 4.3], ['Hierarchy', 4.1], ['Brand and season', 4.4]), verdict: 'selected', reason: 'Each quarter still works alone.' },
          { id: 'pc-s2', title: 'Table seen from above', art: scene('rooftop', ROOF, { sketch: true, composition: 'high-horizon', seed: 2 }), scores: scores(['Concept', 4.0], ['Composition', 3.6], ['Hierarchy', 3.5], ['Brand and season', 3.8]), verdict: 'rejected', reason: 'Hard to read on a curved can.' },
          { id: 'pc-s3', title: 'Hands passing a can', art: scene('rooftop', ROOF, { sketch: true, composition: 'close-up', seed: 2 }), scores: scores(['Concept', 3.8], ['Composition', 3.9], ['Hierarchy', 3.6], ['Brand and season', 3.3]), verdict: 'rejected', reason: 'Loses the plum tree and the season.' },
        ],
        sketchNote: 'Packaging sketches judged on idea, composition, hierarchy and brand/season.',
        refined: [
          {
            version: 1,
            art: panoramaSleeve,
            explanation: 'Four cans, four friends under one plum tree at dusk. Side by side they complete the scene; the sleeve closes with a furoshiki-style knot, so it looks gift-ready without wrapping.',
            scores: sC,
            requirements: [
              { text: 'Plum identifiable as the flavour', met: true, note: 'Plum tree and fruit in every quarter, word “plum” on each can.' },
              { text: 'Oriya family seal present', met: true, note: 'On each can and on the knot.' },
              { text: 'Nothing implies strength or size', met: true, note: 'No strength cues; no drinking shown.' },
              { text: 'Each can works alone in the chiller', met: true, note: 'Every quarter is a complete small scene.' },
            ],
            status: 'awaiting_review',
            challenge: { claim: 'Gift presentability 4.7', challenge: 'The knot is a print, not a real closure — will it read as a cheap trick?', resolution: 'Shown as a printed graphic in the concept; a real fold is a production question for later.', outcome: 'partly_upheld' },
          },
        ],
        views: [
          { label: 'Can 1 of 4', art: pack('can', 'front', PANO(0)) },
          { label: 'Can 2 of 4', art: pack('can', 'front', PANO(1)) },
          { label: 'Can 3 of 4', art: pack('can', 'front', PANO(2)) },
          { label: 'Can 4 of 4', art: pack('can', 'front', PANO(3)) },
          { label: 'Gift sleeve', art: panoramaSleeve },
        ],
        mockups: [
          { label: 'Gift table', why: 'Tests whether the sleeve looks presentable unwrapped.', art: mock('gift-table', panoramaSleeve) },
          { label: 'Chiller shelf', why: 'Tests a single can on its own.', art: mock('shelf', pack('can', 'front', PANO(1))) },
        ],
      },
    ],
    similarity: [
      { pair: ['B', 'C'], level: 'medium', note: 'Both lean on plum-to-pink colour.', action: 'C stays flat illustration; only B uses gradients.' },
      { pair: ['A', 'B'], level: 'low', note: 'Brush heritage against visible sparkle.', action: 'None needed.' },
      { pair: ['A', 'C'], level: 'low', note: 'Single branch against a full scene.', action: 'None needed.' },
    ],
    conceptLimits: [
      'Can shape and size are illustrative; the brief does not specify them.',
      'No strength statement or legal marks are shown, because strength is not confirmed. Final artwork must add them once known.',
      'Materials, finishes and print processes are not specified. Mockups are concepts, not production engineering.',
    ],
  },
  contentReview: {
    checks: [
      { id: 'pq1', question: 'Does it answer the brief?', outcome: 'pass', note: 'Can and gift sleeve answered with one system per direction.' },
      { id: 'pq2', question: 'Are research, conclusions, themes and visuals connected?', outcome: 'pass', note: 'Each direction traces back to an opportunity.' },
      { id: 'pq3', question: 'Do the transitions read naturally?', outcome: 'revised', note: 'Added a line between the chiller finding and the strategy.' },
      { id: 'pq4', question: 'Is the language concise and brand-strategic?', outcome: 'revised', note: 'Shortened the direction introductions.' },
      { id: 'pq5', question: 'Are factual claims supported?', outcome: 'revised', note: 'Removed “perfect for parties”; no source supports it.' },
      { id: 'pq6', question: 'Do images and copy say the same thing?', outcome: 'pass', note: '' },
      { id: 'pq7', question: 'Are the three directions meaningfully different?', outcome: 'pass', note: 'Heritage, sparkle, sharing.' },
    ],
    narrative: [
      { id: 'pn1', title: 'Opening', text: 'Every plum can in the chiller is dark purple. Plumtide does not have to be.', before: null, changeReason: null },
      { id: 'pn2', title: 'The question', text: 'How can a new plum drink be picked first, given as a gift, and still be unmistakably Oriya?', before: null, changeReason: null },
      { id: 'pn3', title: 'What we found', text: 'Dark grounds and fruit photos everywhere; sleeves bought when they look presentable unwrapped; cans shared on a table; plum blossom already means New Year.', before: null, changeReason: null },
      { id: 'pn4', title: 'Three directions', text: 'A takes Oriya’s branch onto a cream can. B makes the sparkle visible. C splits one get-together across four cans.', before: 'We present three directions, each perfect for parties.', changeReason: 'Unsupported claim removed.' },
      { id: 'pn5', title: 'Recommendation', text: 'Lead with C for the gift sleeve and range launch; keep A as the heritage alternative.', before: null, changeReason: null },
    ],
  },
  layout: {
    styles: [
      EDITORIAL_STYLE,
      COBALT_STYLE,
      STUDIO_STYLE,
    ],
    chosen: null,
    chosenBy: null,
    slides: [
      { id: 'ps1', kind: 'cover', lead: 'Plumtide', support: 'Packaging proposal · can and gift sleeve', art: panoramaSleeve, notes: '' },
      { id: 'ps2', kind: 'question', lead: 'How can a new plum drink be picked first — and given as a gift — while clearly belonging to Oriya?', support: 'The question', notes: '' },
      { id: 'ps3', kind: 'data', lead: '7 of 12', support: 'competitor can fronts were dark purple.', bigNumber: '7/12', notes: 'Sample field notes, illustrative demo data.' },
      { id: 'ps4', kind: 'conclusion', lead: 'Go light and illustrated, and design the can and the sleeve as one system.', support: 'Category · Brand · Audience', notes: '' },
      { id: 'ps5', kind: 'visual', lead: 'Ink orchard', support: 'A new branch of an old orchard.', directionId: 'A', art: pack('can', 'three-quarter', INK), notes: '' },
      { id: 'ps6', kind: 'visual', lead: 'Rising plum', support: 'Plum that won’t sit still.', directionId: 'B', art: pack('can', 'three-quarter', BUBBLE), notes: '' },
      { id: 'ps7', kind: 'visual', lead: 'Pass it on', support: 'Four cans. One picture.', directionId: 'C', art: panoramaSleeve, notes: '' },
      { id: 'ps8', kind: 'mockup', lead: 'On the gift table', support: 'Presentable without wrapping.', directionId: 'C', art: mock('gift-table', panoramaSleeve), notes: '' },
      { id: 'ps9', kind: 'mockup', lead: 'In the chiller', support: 'Light against a wall of purple.', directionId: 'A', art: mock('shelf', pack('can', 'front', INK)), notes: '' },
      { id: 'ps10', kind: 'comparison', lead: 'Three ways to be picked first', support: 'Heritage · Sparkle · Sharing', notes: '' },
      { id: 'ps11', kind: 'recommendation', lead: 'Lead with C. Keep A as the heritage route.', support: 'Solves the can and the gift sleeve with one idea.', directionId: 'C', art: panoramaSleeve, notes: '' },
      { id: 'ps12', kind: 'closing', lead: 'Before artwork: confirm strength, size and materials.', support: 'Open questions for Oriya', notes: '' },
    ],
    editability: {
      native: ['Every headline, line of copy and caption', 'Slide backgrounds, rules and colour fields', 'Charts, as native PowerPoint charts'],
      raster: ['Generated packshots and mockups, placed as replaceable images'],
    },
  },
  delivery: {
    checks: [
      { id: 'pd1', area: 'Content integrity', outcome: 'pass', note: '' },
      { id: 'pd2', area: 'Visual hierarchy and consistency', outcome: 'pass', note: '' },
      { id: 'pd3', area: 'Image quality and cropping', outcome: 'pass', note: '' },
      { id: 'pd4', area: 'Text overflow and legibility', outcome: 'fixed', note: 'Direction C subline shortened.' },
      { id: 'pd5', area: 'Mockups fit the intended use', outcome: 'pass', note: 'Chiller, gift table and in-hand only.' },
      { id: 'pd6', area: 'Rendering', outcome: 'pass', note: '' },
      { id: 'pd7', area: 'Editability of the PPT', outcome: 'pass', note: '' },
    ],
    comparison: [
      { criterion: 'Creative mechanism', values: { A: 'Parent-brand heritage', B: 'Sparkle made visible', C: 'Sharing in the structure' } },
      { criterion: 'Lead line', values: { A: 'A new branch of an old orchard.', B: 'Plum that won’t sit still.', C: 'Four cans. One picture.' } },
      { criterion: 'Communication score', values: { A: '3.96', B: '4.18', C: '4.46' } },
      { criterion: 'Gift sleeve', values: { A: 'Calm, classic', B: 'Bold gradient', C: 'Completes the picture' } },
      { criterion: 'Main risk', values: { A: 'Reads as plum wine', B: 'Near competitors’ purple', C: 'Single can shows a quarter' } },
    ],
    recommendation: 'Lead with C for the gift sleeve and launch; keep A as the heritage alternative.',
    limitations: ['Strength, can size and materials are unconfirmed; no legal marks are shown.', 'Packshots are generated concept illustrations, not production artwork.'],
  },
  decisions: [
    { id: 'pd-1', stage: 'strategy', kind: 'approved', by: 'Alex Morgan', at: '2026-10-21T08:00:00Z', comment: 'Agree: go light and illustrated.', reviewerPosition: null },
    { id: 'pd-2', stage: 'themes', kind: 'approved', by: 'Alex Morgan', at: '2026-10-22T07:30:00Z', comment: 'All three are good. For C, look at furoshiki for the sleeve.', reviewerPosition: null },
  ],
  contributions: [
    { id: 'pc-1', stage: 'themes', kind: 'reference', text: 'Furoshiki wrapping cloth', borrow: 'The knot as the sleeve’s closure, so it looks gift-ready without paper.', by: 'Alex Morgan', at: '2026-10-22T07:25:00Z', status: 'used', response: 'Used in C’s refined sleeve.' },
  ],
  tasks: [
    { id: 'pt1', stage: 'brief', agent: 'Proposal Director', level: 'director', task: 'Extract the task card; flag strength, size and age as unknown', status: 'done', startedAt: '2026-10-18T02:05:00Z', seconds: 38, receipt: 'rcpt_pt_brief' },
    { id: 'pt2', stage: 'research', agent: 'Research Lead', level: 'lead', task: 'Plan research for a new product and pack', status: 'done', startedAt: '2026-10-18T07:00:00Z', seconds: 52, receipt: 'rcpt_pt_plan' },
    { id: 'pt3', stage: 'research', agent: 'Case Scout ×2', level: 'specialist', task: 'Chiller comparison and gifting searches', status: 'done', startedAt: '2026-10-18T07:02:00Z', seconds: 180, receipt: 'rcpt_pt_scouts' },
    { id: 'pt4', stage: 'strategy', agent: 'Strategy Lead', level: 'lead', task: 'Sequential argument and opportunities', status: 'done', startedAt: '2026-10-20T04:00:00Z', seconds: 160, receipt: 'rcpt_pt_strat' },
    { id: 'pt5', stage: 'themes', agent: 'Copy Lead', level: 'lead', task: 'Three directions by mechanism', status: 'done', startedAt: '2026-10-21T09:00:00Z', seconds: 210, receipt: 'rcpt_pt_copy' },
    { id: 'pt6', stage: 'visual', agent: 'Reference Scout ×3', level: 'specialist', task: 'Reference searches per direction', status: 'done', startedAt: '2026-10-22T08:00:00Z', seconds: 170, receipt: 'rcpt_pt_refs' },
    { id: 'pt7', stage: 'visual', agent: 'Pack Renderer', level: 'specialist', task: 'Refine three directions with views and mockups', status: 'done', startedAt: '2026-10-23T08:00:00Z', seconds: 520, receipt: 'rcpt_pt_render' },
    { id: 'pt8', stage: 'visual', agent: 'Visual Evaluator', level: 'evaluator', task: 'Rate refined concepts', status: 'done', startedAt: '2026-10-24T09:00:00Z', seconds: 66, receipt: 'rcpt_pt_eval' },
  ],
  reviews: [
    { id: 'pr1', stage: 'themes', subject: 'Directions A–C', evaluator: 'Copy Evaluator', average: Math.round(((avg(tA) + avg(tB) + avg(tC)) / 3) * 100) / 100, verdict: 'All passed; C recommended', challenge: null, directorResolution: 'Sent to you at the themes checkpoint.', at: '2026-10-21T13:00:00Z' },
    { id: 'pr2', stage: 'visual', subject: 'A refined', evaluator: 'Visual Evaluator', average: avg(sA), verdict: 'Passed', challenge: null, directorResolution: null, at: '2026-10-24T09:10:00Z' },
    { id: 'pr3', stage: 'visual', subject: 'B refined', evaluator: 'Visual Evaluator', average: avg(sB), verdict: 'Passed after gradient lift', challenge: { claim: 'Stand-out 4.5', challenge: 'Base near competitor purple.', resolution: 'Top half pink.', outcome: 'upheld' }, directorResolution: null, at: '2026-10-24T09:20:00Z' },
    { id: 'pr4', stage: 'visual', subject: 'C refined', evaluator: 'Visual Evaluator', average: avg(sC), verdict: 'Passed review — waiting for your decision', challenge: { claim: 'Gift presentability 4.7', challenge: 'Printed knot may read as a trick.', resolution: 'Concept only; fold is a production question.', outcome: 'partly_upheld' }, directorResolution: 'Sent to you at the visual checkpoint.', at: '2026-10-24T09:40:00Z' },
  ],
  handoffs: [
    { id: 'ph1', from: 'research', to: 'strategy', producer: 'Research Lead', consumer: 'Strategy Lead', producerCheck: 'Released with three prohibited inferences: strength, age, buyer = drinker.', consumerCheck: 'Accepted; open questions carried into the task card.', status: 'accepted', at: '2026-10-20T03:00:00Z' },
    { id: 'ph2', from: 'strategy', to: 'themes', producer: 'Strategy Lead', consumer: 'Copy Lead', producerCheck: 'Three opportunities with evidence.', consumerCheck: 'Each supports a distinct mechanism.', status: 'accepted', at: '2026-10-21T08:10:00Z' },
    { id: 'ph3', from: 'themes', to: 'visual', producer: 'Copy Lead', consumer: 'Visual Lead', producerCheck: 'Lines final; your furoshiki reference attached.', consumerCheck: 'Requested the “no strength cues” rule in writing.', status: 'accepted', at: '2026-10-22T07:40:00Z' },
  ],
  versions: [
    { id: 'pv1', stage: 'brief', label: 'Task card', version: 1, inputs: ['Client brief', 'Oriya brand book'], at: '2026-10-18T06:30:00Z', state: 'current', impact: null },
    { id: 'pv2', stage: 'research', label: 'Research board', version: 1, inputs: ['Task card v1', '5 sources'], at: '2026-10-20T03:00:00Z', state: 'current', impact: null },
    { id: 'pv3', stage: 'strategy', label: 'Strategy', version: 1, inputs: ['Research v1'], at: '2026-10-21T08:00:00Z', state: 'current', impact: null },
    { id: 'pv4', stage: 'themes', label: 'Directions', version: 1, inputs: ['Strategy v1', 'Your furoshiki reference'], at: '2026-10-22T07:30:00Z', state: 'current', impact: null },
    { id: 'pv5', stage: 'visual', label: 'Refined concepts', version: 1, inputs: ['Directions v1'], at: '2026-10-24T09:40:00Z', state: 'current', impact: null },
  ],
  revision: 18,
  updatedAt: '2026-10-24T09:40:00Z',
};
