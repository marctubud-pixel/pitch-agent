/**
 * KV demo: Northline Outdoor, autumn–winter seasonal key visual. An existing product with a
 * seasonal assignment, so research centres on brand history, comparable seasonal campaigns,
 * audience emotions and the visual cues of the season. Complete through delivery.
 *
 * Claim references (c1…c6) point at the Workbench research for project `northline`; their
 * support status is read from the service, not repeated here. Artwork is generated.
 */
import type { Proposal } from '../../../domain/proposal';
import { avg, brief, chart, claim, COBALT_STYLE, EDITORIAL_STYLE, kase, STUDIO_STYLE, LEADS, mock, poster, scene, scores, stage } from './helpers';

const FROST = ['#cfdde6', '#8fa3a8', '#5f7368', '#3e4c40', '#f3d9a4', '#1d241e'];
const GOLD = ['#ead9b8', '#a7a37a', '#7d8f6a', '#56664a', '#e8a548', '#1d241e'];
const DUSK = ['#33476b', '#25344f', '#1b2740', '#111829', '#f2b45a', '#0b101b'];
const WARMDUSK = ['#e7a46a', '#9c6a5a', '#5f4a4f', '#33303a', '#ffd38a', '#1b1820'];
const TERRAIN = ['#efe2cc', '#ddbf92', '#c98a3d', '#9a5f2a', '#f6e7c8', '#2a1d12'];
const TERRAIN_FROST = ['#dfe7ea', '#d8c3a0', '#c48a45', '#93602f', '#f4f7f8', '#2a1d12'];
const SUMMIT = ['#dfe7ee', '#9aa9b8', '#6b7c8e', '#3e4b5a', '#ffffff', '#1c232b'];
const STUDIO = ['#f1f1ee', '#d33f2a', '#9e2c1d', '#222222', '#ffffff', '#111111'];

const B = 'Northline';

const posterA = poster(scene('ridge-frost', FROST, { composition: 'low-horizon', seed: 3 }), 'Same path. Colder air.', B, {
  subline: 'The autumn–winter layering range',
  typeLayout: 'behind-ridge',
  ink: '#1d241e',
});
const posterB1 = poster(scene('fabric-terrain', TERRAIN, { composition: 'diagonal', seed: 2 }), 'Every ridge, already layered.', B, {
  subline: 'The Northline mid-layer. Tested for warmth.',
  typeLayout: 'stacked-left',
  ink: '#2a1d12',
  typeface: 'grotesk',
});
const posterB2 = poster(scene('fabric-terrain', TERRAIN_FROST, { composition: 'diagonal', seed: 2, label: 'frost' }), 'Every ridge, already layered.', B, {
  subline: 'The Northline mid-layer. Tested for warmth.',
  typeLayout: 'stacked-left',
  ink: '#2a1d12',
  typeface: 'grotesk',
});
const posterC1 = poster(scene('group-dusk', WARMDUSK, { composition: 'wide', seed: 5 }), 'Out before the dark comes in.', B, {
  subline: 'Layers for shorter days and longer evenings',
  typeLayout: 'sky',
  ink: '#fff4e2',
});
const posterC2 = poster(scene('group-dusk', DUSK, { composition: 'wide', seed: 5 }), 'Out before the dark comes in.', B, {
  subline: 'Layers for shorter days and longer evenings',
  typeLayout: 'sky',
  ink: '#fff4e2',
});

const sA = scores(['Concept', 4.3], ['Composition', 4.4], ['Typography in the artwork', 4.2], ['Season shown in the image', 4.5], ['Works as the main KV', 4.6]);
const sB1 = scores(['Concept', 4.2], ['Composition', 4.0], ['Typography in the artwork', 3.9], ['Season shown in the image', 2.6, 'Texture reads as all-season; only the headline says autumn.'], ['Works as the main KV', 3.8]);
const sB2 = scores(['Concept', 4.3], ['Composition', 4.1], ['Typography in the artwork', 4.0], ['Season shown in the image', 4.1, 'Frost along the ridge tops and a low sun.'], ['Works as the main KV', 4.0]);
const sC1 = scores(['Concept', 4.5], ['Composition', 4.4], ['Typography in the artwork', 4.3], ['Season shown in the image', 4.6], ['Works as the main KV', 4.5]);
const sC2 = scores(['Concept', 4.6], ['Composition', 4.5], ['Typography in the artwork', 4.4], ['Season shown in the image', 4.7], ['Works as the main KV', 4.6]);

const themeA = scores(['Clarity and memorability', 4.5], ['Brand and product integration', 4.8], ['Audience resonance', 4.0], ['Differentiation', 3.4], ['Relevance to current communication', 3.6]);
const themeB = scores(['Clarity and memorability', 3.6], ['Brand and product integration', 4.2], ['Audience resonance', 3.7], ['Differentiation', 4.6], ['Relevance to current communication', 4.1]);
const themeC = scores(['Clarity and memorability', 4.6], ['Brand and product integration', 4.1], ['Audience resonance', 4.7], ['Differentiation', 4.3], ['Relevance to current communication', 4.4]);

export const northline: Proposal = {
  id: 'northline-kv',
  workbenchId: 'northline',
  name: 'Northline Outdoor — autumn–winter KV',
  client: 'Northline Outdoor Co. (fictional)',
  type: 'kv',
  summary: 'Seasonal key visual for the layering range, timed for the first cold weekend of autumn.',
  cover: posterC2,
  mode: 'assisted',
  checkpoints: ['themes', 'delivery'],
  currentStage: 'delivery',
  stages: {
    brief: stage('done', 'Task card confirmed (v1). Three facts stay unknown and are not assumed.', LEADS.brief, '2026-10-13T15:00:00Z'),
    research: stage('done', 'Research released for strategy after verification, sufficiency review and both handoffs.', LEADS.research, '2026-10-22T11:30:00Z'),
    strategy: stage('done', 'The first cold weekend on a familiar route: a moment no competitor owns.', LEADS.strategy, '2026-10-22T16:40:00Z'),
    themes: stage('done', 'Three directions. You kept B despite reviewer advice; C is recommended.', LEADS.themes, '2026-10-23T11:05:00Z', 2),
    visual: stage('done', 'Refined visuals for all three directions passed review (B and C after revision).', LEADS.visual, '2026-10-24T13:20:00Z', 2),
    content_review: stage('done', 'Narrative reviewed before layout: 4 passages tightened, 1 unsupported line removed.', LEADS.content_review, '2026-10-24T16:00:00Z'),
    layout: stage('done', 'Editorial style applied to 16 slides with outdoor, window, elevator and phone mockups.', LEADS.layout, '2026-10-25T08:10:00Z'),
    delivery: stage('waiting_for_you', 'Final review passed with 2 fixes. Waiting for your delivery sign-off.', LEADS.delivery, '2026-10-25T09:00:00Z'),
  },
  task: {
    assignment: 'A seasonal key visual for Northline’s autumn–winter layering launch.',
    output: 'One main KV, explored as three creative directions, adapted to outdoor, store window, elevator screen and phone.',
    occasion: 'The first properly cold weekend of autumn',
    scope: ['Main KV, landscape and portrait', 'Three distinct creative directions with a recommendation', 'Placement mockups for the channels in the brief', 'Editable presentation deck'],
    inputs: [
      { id: 'in-1', kind: 'image', title: 'Last winter’s KV (client archive)', note: 'For continuity: small walker, low-level route, wordmark bottom left.', art: poster(scene('ridge', GOLD, { seed: 1 }), 'Walk on.', B, { typeLayout: 'bottom-band', ink: '#f6f1e7' }) },
      { id: 'in-2', kind: 'link', title: 'Northline brand guidelines 2025', note: 'Sample link. Logo placement and type rules.' },
      { id: 'in-3', kind: 'pdf', title: 'Retail partner calendar (draft).pdf', note: 'Draft only; dates not confirmed.' },
    ],
    unknowns: [
      { id: 'u-1', topic: 'Retail partner window dates', why: 'The brief says the launch must fit the calendar, but the dates are not confirmed.' },
      { id: 'u-2', topic: 'Media plan and placement count', why: 'Not in the brief. Mockups show intended uses, not a media buy.' },
      { id: 'u-3', topic: 'Audience age range', why: 'The brief describes weekend walkers without an age band, so none is assumed.' },
    ],
  },
  research: {
    adaptation:
      'An existing product with a seasonal brief: the research looks at Northline’s established expression, how comparable brands mark the season, what walkers feel when the cold arrives and what the season looks like. It does not size the category or reposition the brand; a seasonal KV does not need that.',
    summary:
      'Walkers start preparing on the first cold weekend, not on a date. Competitor launches lean on summit expeditions or product shots, and neither matches the short, social walks of autumn. The open space is the familiar route on the day it turns cold.',
    sections: [
      {
        id: 'brand',
        title: 'Brand and product',
        summary: 'Northline shows real, reachable routes with people small in the landscape. Only warmth and breathability are tested for the mid-layer.',
        findings: [
          { id: 'nb1', kind: 'background', text: 'KVs from 2023 to 2025 show one walker on a low-level path, a wide landscape and the wordmark bottom left.', claimRef: null, note: 'Client archive' },
          { id: 'nb2', kind: 'background', text: 'The mid-layer fleece passed internal warmth and breathability tests. No waterproofing claim is supported.', claimRef: null, note: 'Fabric test summary (sample internal document)' },
        ],
        groups: [
          {
            id: 'g-archive',
            title: 'Northline KVs, 2023–2025',
            kind: 'background',
            takeaway: 'Consistent and recognisable: a small figure, a big ordinary landscape, quiet type.',
            items: [
              { id: 'k-arch-23', title: 'Autumn 2023', caption: 'Ridge path at midday.', art: poster(scene('ridge', GOLD, { seed: 7 }), 'Further than you think.', B, { typeLayout: 'bottom-band' }), source: 'Client archive (illustration)', date: '2023', applicability: 'Direct: the brand’s own past expression.', limitation: null },
              { id: 'k-arch-24', title: 'Winter 2024', caption: 'Overcast valley walk.', art: poster(scene('ridge', ['#d5d9d6', '#9aa39b', '#738070', '#4d5a4c', '#e9e2cf', '#1d241e'], { seed: 9 }), 'Out anyway.', B, { typeLayout: 'bottom-band' }), source: 'Client archive (illustration)', date: '2024', applicability: 'Direct.', limitation: null },
              { id: 'k-arch-25', title: 'Winter 2025', caption: 'Golden hour, single walker.', art: poster(scene('ridge', GOLD, { seed: 1 }), 'Walk on.', B, { typeLayout: 'bottom-band' }), source: 'Client archive (illustration)', date: '2025', applicability: 'Direct.', limitation: null },
            ],
          },
        ],
        chart: null,
      },
      {
        id: 'category',
        title: 'Category conventions and competitor activity',
        summary: 'Seasonal launches in the category split into the summit expedition and the technical product shot. Neither speaks to the first cold weekend on a familiar path.',
        findings: [
          { id: 'nc1', kind: 'evidence', text: 'Layering questions rise in early autumn, ahead of the main winter range.', claimRef: 'c2', note: null },
          { id: 'nc2', kind: 'evidence', text: 'Shoppers find layering confusing when products are grouped by fabric technology.', claimRef: 'c4', note: null },
          { id: 'nc3', kind: 'evidence', text: 'Store windows in early October still showed summer ranges.', claimRef: 'c6', note: null },
        ],
        groups: [
          {
            id: 'g-competitors',
            title: 'Competitor seasonal launches',
            kind: 'comparison',
            takeaway: 'Peaks and product-on-white dominate. Both signal performance, not the ordinary pleasure of the season.',
            items: [
              { id: 'k-summit', title: 'Brand X — “Above the cold”', caption: 'Climber on a snow summit at dawn.', art: scene('summit', SUMMIT, { seed: 2 }), source: 'Competitor campaign (demo illustration)', date: 'Oct 2025', applicability: 'Direct comparison: same category, same season.', limitation: 'One campaign each; not a full audit.' },
              { id: 'k-studio', title: 'Brand Y — winter shell', caption: 'Jacket on white with fabric callouts.', art: scene('studio-jacket', STUDIO, { seed: 1 }), source: 'Competitor campaign (demo illustration)', date: 'Nov 2025', applicability: 'Direct comparison.', limitation: 'One campaign each; not a full audit.' },
              { id: 'k-summit2', title: 'Brand Z — “Go higher”', caption: 'Ridge-line expedition team.', art: scene('summit', ['#e8ecef', '#b3bcc6', '#7f8b98', '#4b5663', '#f4c96a', '#1c232b'], { seed: 6 }), source: 'Competitor campaign (demo illustration)', date: 'Nov 2025', applicability: 'Direct comparison.', limitation: null },
            ],
          },
        ],
        chart: {
          id: 'ch-launch',
          kind: 'bar',
          title: 'When competitors launched their winter campaigns',
          measure: 'Number of the six campaigns reviewed, by launch fortnight',
          data: [
            { label: 'Early Oct', value: 0 },
            { label: 'Late Oct', value: 1 },
            { label: 'Early Nov', value: 3, highlight: true },
            { label: 'Late Nov', value: 2 },
          ],
          note: 'Six campaigns, desk review. Illustrative demo data.',
          demoData: true,
        },
      },
      {
        id: 'audience',
        title: 'Audience and usage occasions',
        summary: 'The cold arrives as a moment, not a date. Walkers check their kit on the first cold weekend and buy when they can picture a specific walk.',
        findings: [
          { id: 'na1', kind: 'evidence', text: 'Walkers start preparing after the first cold weekend of the season, not at a fixed date.', claimRef: 'c1', note: null },
          { id: 'na2', kind: 'evidence', text: 'A layer feels worth buying early when walkers can picture a specific route where it would help.', claimRef: 'c3', note: null },
          { id: 'na3', kind: 'unverified', text: 'Partners and family may buy layers as gifts later in the season, so buyers and wearers can differ.', claimRef: null, note: 'Mentioned by store staff, not in the cited sources. Not used in the strategy.' },
        ],
        groups: [
          {
            id: 'g-moments',
            title: 'Moments walkers described',
            kind: 'background',
            takeaway: 'Illustrations of interview themes, not photos of participants.',
            items: [
              { id: 'k-breath', title: 'Breath in the air', caption: '“The first morning you can see your breath.”', art: scene('ridge-frost', FROST, { seed: 11, composition: 'close-up' }), source: 'Walker interviews (sample notes)', date: 'Oct 2026', applicability: 'Audience emotion; qualitative.', limitation: 'One interview round.' },
              { id: 'k-flask', title: 'The flask at the stile', caption: 'Stopping for something hot.', art: scene('thermos', ['#d9e2e6', '#6f7f74', '#b5532f', '#3e4c40', '#f2e6d0', '#1d241e'], { seed: 2 }), source: 'Walker interviews (sample notes)', date: 'Oct 2026', applicability: 'Audience emotion; qualitative.', limitation: null },
              { id: 'k-group', title: 'Back before dark', caption: 'Shorter walks, together.', art: scene('group-dusk', WARMDUSK, { seed: 3 }), source: 'Walking club newsletters (fictional)', date: 'Autumn 2026', applicability: 'Occasion; qualitative.', limitation: null },
            ],
          },
        ],
        chart: {
          id: 'ch-worth',
          kind: 'bar',
          title: 'What made a layer feel worth buying',
          measure: 'Interview participants mentioning each reason (n = 12)',
          data: [
            { label: 'Picturing a specific walk', value: 9, highlight: true },
            { label: 'A friend’s recommendation', value: 4 },
            { label: 'A price promotion', value: 3 },
            { label: 'Fabric technology', value: 2 },
          ],
          note: 'Sample interview notes; participants could give more than one reason. Illustrative demo data.',
          demoData: true,
        },
      },
      {
        id: 'context',
        title: 'Seasonal and cultural context',
        summary: 'Autumn is a social season of shorter walks, early sunsets and stops on the way home. Its cues — low sun, first frost, visible breath, lit windows by five — belong in the picture, not only in the headline.',
        findings: [
          { id: 'nx1', kind: 'evidence', text: 'Walking club newsletters frame autumn as a season of shorter, social walks.', claimRef: 'c5', note: null },
          { id: 'nx2', kind: 'background', text: 'Visual cues of the first cold weekend: frost on grass in the morning, a low raking sun, visible breath, windows lit by five o’clock.', claimRef: null, note: 'Desk research and location scouting' },
        ],
        groups: [
          {
            id: 'g-inspiration',
            title: 'Cross-industry inspiration',
            kind: 'inspiration',
            takeaway: 'Treatment ideas — warm against cold, craft texture, vintage travel poster flatness. They show how to draw, not what walkers prefer.',
            items: [
              { id: 'k-cabin', title: 'Hotel winter campaign', caption: 'A lit window in blue hour.', art: scene('cabin-window', DUSK, { seed: 4 }), source: 'Hospitality advertising (demo illustration)', date: '2025', applicability: 'Inspiration only: warm/cold contrast.', limitation: 'Different category and audience.' },
              { id: 'k-knit', title: 'Knitwear lookbook', caption: 'Raking light across a knit.', art: scene('knit', ['#e9dcc8', '#c9a77c', '#a97d4f', '#7a5634', '#f7ecd8', '#2a1d12'], { seed: 1 }), source: 'Fashion lookbook (demo illustration)', date: '2026', applicability: 'Inspiration only: texture as landscape.', limitation: 'Different category.' },
              { id: 'k-travel', title: '1970s rail travel poster', caption: 'Flat colour hills and a bold sky.', art: scene('catalogue-1970', ['#f0e2c2', '#e0a05a', '#7d8f6a', '#3e5a4e', '#c94f3a', '#1d241e'], { seed: 2 }), source: 'Archive poster (demo illustration)', date: '1970s', applicability: 'Inspiration only: flat graphic landscape.', limitation: 'Historic style; not current audience taste.' },
            ],
          },
        ],
        chart: null,
      },
    ],
  },
  strategy: {
    question: 'How can Northline own the moment the season turns, so walkers think of a Northline layer before the first cold weekend rather than after it?',
    structure: 'question-parallel-synthesis',
    circles: {
      category: {
        title: 'Category: peaks and performance',
        points: [
          { text: 'Seasonal launches show summits or products on white.', evidence: [kase('k-summit', 'Brand X'), kase('k-studio', 'Brand Y')] },
          { text: 'Most launch in November; windows still show summer in early October.', evidence: [chart('ch-launch', 'Launch timing'), claim('c6', 'Window survey')] },
          { text: 'Fabric-led grouping confuses shoppers.', evidence: [claim('c4', 'Staff conversations')] },
        ],
      },
      brand: {
        title: 'Northline: ordinary routes, honestly shown',
        points: [
          { text: 'Years of reachable routes with people small in the landscape.', evidence: [kase('k-arch-25', 'KV 2025'), kase('k-arch-23', 'KV 2023')] },
          { text: 'The mid-layer’s warmth is tested; nothing more is claimed.', evidence: [brief('constraints', 'Brief constraint')] },
        ],
      },
      audience: {
        title: 'Walkers: the first cold weekend',
        points: [
          { text: 'Preparation starts on the first cold weekend.', evidence: [claim('c1', 'Walker interviews')] },
          { text: 'A layer feels worth buying when you can picture the walk.', evidence: [claim('c3', 'Walker interviews'), chart('ch-worth', 'Reasons')] },
          { text: 'Autumn walks are shorter and social.', evidence: [claim('c5', 'Club newsletters')] },
        ],
      },
    },
    intersection: {
      insight: 'The first cold weekend on a familiar route: a moment no competitor owns, Northline’s landscapes already know, and walkers already feel.',
      why: 'The category goes up mountains; Northline stays on reachable paths; walkers decide on one specific cold day.',
    },
    argument: [
      { step: 'The decision happens on a day, not a date.', detail: 'Walkers check their kit on the first cold weekend, and retailers hear layering questions weeks before winter ranges arrive.', evidence: [claim('c1', 'Interviews'), claim('c2', 'Trade survey')] },
      { step: 'That day is ordinary and social, not heroic.', detail: 'Autumn walks are shorter and shared; the summit imagery competitors use belongs to a different trip.', evidence: [claim('c5', 'Newsletters'), kase('k-summit', 'Brand X')] },
      { step: 'Northline already speaks this way.', detail: 'Its archive of small figures on reachable routes is exactly the scale of that day.', evidence: [kase('k-arch-25', 'KV 2025')] },
      { step: 'So the cold has to be in the picture.', detail: 'Frost, low sun, breath and lit windows carry the season; a headline alone would not.', evidence: [kase('k-breath', 'Breath in the air')] },
    ],
    conclusion: 'Lead with the first cold weekend on a familiar route, drawn so the cold is felt in the image itself.',
    answer: 'Northline owns the turn of the season by being the brand that shows it — the familiar walk on the first cold day — weeks before competitors’ winter campaigns arrive.',
    opportunities: [
      { id: 'o1', title: 'Same path, first frost', idea: 'Keep the familiar Northline route and let the season change around it.', because: 'Brand continuity plus the visual cues of the first cold morning.', evidence: [kase('k-arch-25', 'KV 2025'), kase('k-breath', 'Breath')], leadsTo: 'A' },
      { id: 'o2', title: 'The layer is the landscape', idea: 'Make the mid-layer’s texture the terrain of the walk.', because: 'Walkers buy when they can picture where a layer is worn; the product can become that place.', evidence: [claim('c3', 'Picture the walk')], leadsTo: 'B' },
      { id: 'o3', title: 'Out before dark, together', idea: 'Show the social, shorter walk at blue hour with warmth waiting at the end.', because: 'Autumn is framed as a social season; the occasion is the evening coming in.', evidence: [claim('c5', 'Newsletters'), kase('k-group', 'Back before dark')], leadsTo: 'C' },
    ],
  },
  themes: {
    copyDirection: 'Short, plain-spoken lines in Northline’s voice: present tense, no technical vocabulary, the cold named rather than dramatised.',
    historicalNote: 'Past Northline headlines ran three to five words with a quiet subline. We kept the brevity without forcing every direction into the same two-line shape.',
    directions: [
      {
        id: 'A',
        mechanism: 'evolution',
        name: 'First frost',
        slogan: 'Same path. Colder air.',
        subline: 'The autumn–winter layering range from Northline.',
        rationale: 'Keeps the brand’s familiar route and small figure and lets the season do the talking: frost, low sun and visible breath.',
        connections: { brand: 'Continues the 2023–2025 KVs directly.', audience: 'Mirrors the first cold weekend walkers described.', assignment: 'A seasonal KV that is unmistakably Northline.' },
        difference: 'The only direction that changes nothing but the weather. Continuity is the idea.',
        copyLines: ['Same path. Colder air.', 'You know this walk. Now it’s cold.', 'The first frost changes the route, not the plan.'],
        color: '#9fb7c9',
        scores: themeA,
        challenges: [{ claim: 'Brand integration is excellent (4.8).', challenge: 'Perfect continuity can read as last year’s campaign with frost added.', resolution: 'Accepted in part: the visual must make the cold the subject, not a filter.', outcome: 'partly_upheld' }],
        brandView: 'Safest for the brand team; strongest recognition.',
        audienceView: 'Recognisable and calm; may not stop someone scrolling.',
        reviewOutcome: 'passed',
        disposition: 'kept',
      },
      {
        id: 'B',
        mechanism: 'product',
        name: 'Warm terrain',
        slogan: 'Every ridge, already layered.',
        subline: 'The Northline mid-layer. Tested for warmth.',
        rationale: 'Turns the fleece’s texture into the hills of the route, so the product and the walk become one image.',
        connections: { brand: 'Puts the hero mid-layer at the centre without technical claims.', audience: 'Helps walkers picture where the layer is worn.', assignment: 'A product-led route within the seasonal KV.' },
        difference: 'The only direction where the product is the landscape.',
        copyLines: ['Every ridge, already layered.', 'Warmth, mapped.', 'Built for the hills you already walk.'],
        color: '#c98a3d',
        scores: themeB,
        challenges: [{ claim: 'Differentiation is high (4.6).', challenge: 'Texture-as-landscape can read as abstract at small sizes, and “layered” risks a technical promise.', resolution: 'Subline limited to “Tested for warmth”; phone crop keeps a walker in frame for scale.', outcome: 'upheld' }],
        brandView: 'Shows the product confidently, within tested claims.',
        audienceView: 'Striking, but needs a second look to read.',
        reviewOutcome: 'passed_with_notes',
        disposition: 'kept_by_you_despite_review',
      },
      {
        id: 'C',
        mechanism: 'audience',
        name: 'Out before dark',
        slogan: 'Out before the dark comes in.',
        subline: 'Layers for shorter days and longer evenings.',
        rationale: 'Amplifies the social side of autumn walks: a small group on the last stretch as the light goes and the village windows come on.',
        connections: { brand: 'Northline’s reachable routes, with company.', audience: 'Straight from interview and club evidence: short, social autumn walks.', assignment: 'A seasonal KV with a clear occasion.' },
        difference: 'The only direction about people together and the warmth waiting at the end.',
        copyLines: ['Out before the dark comes in.', 'Shorter days. Same walks. Better company.', 'Back before the lights are on. Just.'],
        color: '#23334d',
        scores: themeC,
        challenges: [{ claim: 'Audience resonance is high (4.7).', challenge: 'A pub at the end could imply drinking is part of the walk.', resolution: 'Lit village windows only; no glasses or bar. The group is walking.', outcome: 'partly_upheld' }],
        brandView: 'Warmer than usual for Northline, still honest.',
        audienceView: 'Closest to how walkers described their autumn.',
        reviewOutcome: 'passed',
        disposition: 'recommended',
      },
    ],
    recommendation: {
      id: 'C',
      reasons: ['Highest communication score (4.42) and the strongest audience evidence.', 'The season is inside the image: blue hour, low light, lit windows.', 'Clearly apart from competitors’ summit and product conventions.'],
    },
    directorNote: 'Reviewers suggested replacing B with a lighter product idea. You kept B (“keep one bold product route”). It stays in the set as your choice, with its review notes kept.',
  },
  visual: {
    branches: [
      {
        directionId: 'A',
        search: { seeking: 'The same place on its first cold morning.', borrow: ['Frost as a surface', 'Low raking light', 'Visible breath for scale'], notFor: 'Snow and summits — the brief rules out expedition settings.' },
        references: [
          { id: 'ar1', title: 'Frosted field at sunrise', origin: 'cross_industry', art: scene('ridge-frost', FROST, { seed: 21, composition: 'close-up' }), borrow: 'Frost catching the low sun across the foreground.', verdict: 'selected', reason: 'Makes the cold visible without snow.' },
          { id: 'ar2', title: 'Northline KV 2025', origin: 'task_matched', art: poster(scene('ridge', GOLD, { seed: 1 }), 'Walk on.', B, { typeLayout: 'bottom-band' }), borrow: 'The path leading in, the small figure.', verdict: 'selected', reason: 'Anchors the composition in the brand’s own work.' },
          { id: 'ar3', title: 'Competitor summit at dawn', origin: 'task_matched', art: scene('summit', SUMMIT, { seed: 3 }), borrow: 'Dawn light only.', verdict: 'rejected', reason: 'Expedition setting conflicts with the accessible-routes constraint.' },
          { id: 'ar4', title: 'Weather app seasonal splash', origin: 'cross_industry', art: scene('contour', ['#dbe6ee', '#9fb7c9', '#6f8ea6', '#3f5d77', '#f3d9a4', '#1d2a36'], { seed: 4 }), borrow: 'A temperature cue.', verdict: 'rejected', reason: 'Reads as a screen, not a landscape.' },
        ],
        referenceNote: 'Two of four selected: one for the cold, one for the brand’s composition.',
        sketches: [
          { id: 'as1', title: 'Low horizon, path leading in', art: scene('ridge-frost', FROST, { sketch: true, composition: 'low-horizon', seed: 3 }), scores: scores(['Concept', 4.3], ['Composition', 4.4], ['Hierarchy', 4.0], ['Brand and season', 4.5]), verdict: 'selected', reason: 'Room in the sky for type; the path carries the eye to the walker.' },
          { id: 'as2', title: 'Frost close-up foreground', art: scene('ridge-frost', FROST, { sketch: true, composition: 'close-up', seed: 3 }), scores: scores(['Concept', 3.8], ['Composition', 3.6], ['Hierarchy', 3.2], ['Brand and season', 4.1]), verdict: 'rejected', reason: 'Becomes a frost study; the walker is lost.' },
          { id: 'as3', title: 'Walker centred on the ridge', art: scene('ridge-frost', FROST, { sketch: true, composition: 'centered', seed: 3 }), scores: scores(['Concept', 3.5], ['Composition', 3.4], ['Hierarchy', 3.9], ['Brand and season', 3.6]), verdict: 'rejected', reason: 'Static, and close to a summit pose.' },
        ],
        sketchNote: 'Sketches judged on idea, composition, hierarchy and brand/season — not on finish.',
        refined: [
          {
            version: 1,
            art: posterA,
            explanation: 'The path from last year’s KVs on its first frosty morning. The low sun catches the frost and the walker’s breath; the headline sits behind the far ridge so the landscape holds it.',
            scores: sA,
            requirements: [
              { text: 'Season shown inside the image', met: true, note: 'Frost and visible breath.' },
              { text: 'Accessible, low-level route', met: true, note: '' },
              { text: 'No technical claims', met: true, note: '' },
              { text: 'Works as the main KV', met: true, note: 'Reads at 6-sheet and phone crop.' },
            ],
            status: 'accepted',
            challenge: null,
          },
        ],
        views: [],
        mockups: [
          { label: 'Store window', why: 'Windows still show summer in early October (window survey): this is where recognition matters.', art: mock('store-window', posterA) },
          { label: 'Bus shelter 6-sheet', why: 'Outdoor placement named in the brief.', art: mock('bus-shelter', posterA) },
        ],
      },
      {
        directionId: 'B',
        search: { seeking: 'Ways a material becomes a place.', borrow: ['Macro texture as topography', 'Contour lines', 'Warm light raking across texture'], notFor: 'Products on white — the convention we are moving away from.' },
        references: [
          { id: 'br1', title: 'Topographic map print', origin: 'cross_industry', art: scene('contour', ['#efe6d6', '#d4b88f', '#b98c5a', '#8a6038', '#f6ecdc', '#2a1d12'], { seed: 7 }), borrow: 'Contour lines that turn texture into terrain.', verdict: 'selected', reason: 'Connects fabric to route.' },
          { id: 'br2', title: 'Knitwear lookbook macro', origin: 'cross_industry', art: scene('knit', ['#e9dcc8', '#c9a77c', '#a97d4f', '#7a5634', '#f7ecd8', '#2a1d12'], { seed: 3 }), borrow: 'Raking light that makes a knit read as hills.', verdict: 'selected', reason: 'The lighting mechanism the idea needs.' },
          { id: 'br3', title: 'Competitor jacket on white', origin: 'task_matched', art: scene('studio-jacket', STUDIO, { seed: 2 }), borrow: '—', verdict: 'rejected', reason: 'The convention to move away from.' },
          { id: 'br4', title: 'Ceramic glaze close-up', origin: 'cross_industry', art: scene('perfume-glass', ['#e8e2d8', '#b9a48a', '#8c7660', '#5b4a3c', '#f4efe6', '#2a1d12'], { seed: 1 }), borrow: 'Surface depth.', verdict: 'rejected', reason: 'Beautiful, but no route and no link to walking.' },
        ],
        referenceNote: 'Cross-industry references lead here; they show treatment, not proof that walkers prefer it.',
        sketches: [
          { id: 'bs1', title: 'Pure texture, full frame', art: scene('fabric-terrain', TERRAIN, { sketch: true, composition: 'close-up', seed: 2 }), scores: scores(['Concept', 3.9], ['Composition', 3.5], ['Hierarchy', 3.0], ['Brand and season', 3.2]), verdict: 'rejected', reason: 'No scale; reads as abstract.' },
          { id: 'bs2', title: 'Texture ridges with a tiny walker', art: scene('fabric-terrain', TERRAIN, { sketch: true, composition: 'diagonal', seed: 2 }), scores: scores(['Concept', 4.4], ['Composition', 4.1], ['Hierarchy', 4.0], ['Brand and season', 3.9]), verdict: 'selected', reason: 'The walker gives scale and turns texture into terrain.' },
          { id: 'bs3', title: 'Product left, landscape right', art: scene('fabric-terrain', TERRAIN, { sketch: true, composition: 'split', seed: 2 }), scores: scores(['Concept', 3.4], ['Composition', 3.6], ['Hierarchy', 3.3], ['Brand and season', 3.5]), verdict: 'rejected', reason: 'Explains instead of shows; two images compete.' },
        ],
        sketchNote: 'Sketches judged on idea, composition, hierarchy and brand/season — not on finish.',
        refined: [
          {
            version: 1,
            art: posterB1,
            explanation: 'Fleece ridges as hills with a walker crossing them.',
            scores: sB1,
            requirements: [
              { text: 'Season shown inside the image', met: false, note: 'Texture reads as any season; only the headline says autumn.' },
              { text: 'No technical claims', met: true, note: '' },
              { text: 'Works as the main KV', met: true, note: '' },
            ],
            status: 'superseded',
            challenge: { claim: 'Concept scores 4.2.', challenge: 'A seasonal KV whose season lives only in the headline does not meet the brief.', resolution: 'Returned for revision: put the cold into the terrain itself.', outcome: 'upheld' },
          },
          {
            version: 2,
            art: posterB2,
            explanation: 'The fleece terrain on a frosty morning: frost picks out the ridge tops and a low sun rakes across the pile, so the texture reads as cold hills. A single walker gives scale.',
            scores: sB2,
            requirements: [
              { text: 'Season shown inside the image', met: true, note: 'Frost on the ridge tops, low sun.' },
              { text: 'No technical claims', met: true, note: 'Subline: “Tested for warmth.”' },
              { text: 'Works as the main KV', met: true, note: 'Walker kept in the phone crop for scale.' },
            ],
            status: 'accepted',
            challenge: null,
          },
        ],
        views: [],
        mockups: [
          { label: 'Elevator screen', why: 'Close viewing suits a texture-led image.', art: mock('elevator', posterB2) },
          { label: 'Phone story', why: 'Tests whether the texture reads at small size.', art: mock('phone', posterB2) },
        ],
      },
      {
        directionId: 'C',
        search: { seeking: 'Warm light meeting cold dusk, with people in it.', borrow: ['Lit windows against blue hour', 'Small group silhouettes', 'A warm/cold colour split'], notFor: 'Bars and drinking scenes.' },
        references: [
          { id: 'cr1', title: 'Hotel winter campaign', origin: 'cross_industry', art: scene('cabin-window', DUSK, { seed: 4 }), borrow: 'The lit window as the warm destination.', verdict: 'selected', reason: 'Warm/cold contrast without showing a bar.' },
          { id: 'cr2', title: 'Walking club newsletter photo', origin: 'task_matched', art: scene('group-dusk', WARMDUSK, { seed: 8, composition: 'close-up' }), borrow: 'Real group sizes and walking pace.', verdict: 'selected', reason: 'Keeps the people believable.' },
          { id: 'cr3', title: 'Festival lantern parade', origin: 'cross_industry', art: scene('festival-lanterns', DUSK, { seed: 2 }), borrow: 'Points of light.', verdict: 'rejected', reason: 'Too festive; shifts the occasion.' },
          { id: 'cr4', title: 'Pub interior advert', origin: 'cross_industry', art: scene('cabin-window', WARMDUSK, { seed: 9, composition: 'close-up' }), borrow: 'Glow.', verdict: 'rejected', reason: 'Implies drinking is the point of the walk.' },
        ],
        referenceNote: 'One task-matched reference keeps the group real; one cross-industry reference supplies the light.',
        sketches: [
          { id: 'cs1', title: 'Group on the ridge, village below', art: scene('group-dusk', DUSK, { sketch: true, composition: 'wide', seed: 5 }), scores: scores(['Concept', 4.6], ['Composition', 4.4], ['Hierarchy', 4.3], ['Brand and season', 4.6]), verdict: 'selected', reason: 'Route, people and destination in one read.' },
          { id: 'cs2', title: 'Faces lit up close', art: scene('group-dusk', DUSK, { sketch: true, composition: 'close-up', seed: 5 }), scores: scores(['Concept', 3.7], ['Composition', 3.8], ['Hierarchy', 3.9], ['Brand and season', 3.4]), verdict: 'rejected', reason: 'Loses the route; reads as a portrait.' },
          { id: 'cs3', title: 'Silhouettes against the sky', art: scene('group-dusk', DUSK, { sketch: true, composition: 'low-horizon', seed: 5 }), scores: scores(['Concept', 3.9], ['Composition', 4.0], ['Hierarchy', 3.8], ['Brand and season', 3.7]), verdict: 'rejected', reason: 'No warm destination; just dusk.' },
        ],
        sketchNote: 'Sketches judged on idea, composition, hierarchy and brand/season — not on finish.',
        refined: [
          {
            version: 1,
            art: posterC1,
            explanation: 'A small group on the last stretch at sunset, village below.',
            scores: sC1,
            requirements: [
              { text: 'Season shown inside the image', met: true, note: '' },
              { text: 'No drinking implied', met: true, note: '' },
              { text: 'Works as the main KV', met: true, note: '' },
            ],
            status: 'superseded',
            challenge: { claim: 'Passes on its own (4.46).', challenge: 'Next to A, both use a warm low sun on a ridge: the set looks like one idea twice.', resolution: 'Move C to blue hour so warmth comes only from the windows.', outcome: 'upheld' },
          },
          {
            version: 2,
            art: posterC2,
            explanation: 'Blue hour on the last stretch home: the cold is in the sky and the warmth is only in the village windows, so the group is walking towards it. No glasses, no bar — the walk is the occasion.',
            scores: sC2,
            requirements: [
              { text: 'Season shown inside the image', met: true, note: 'Blue hour, early lights.' },
              { text: 'No drinking implied', met: true, note: 'Village windows only.' },
              { text: 'Works as the main KV', met: true, note: 'Holds at 48-sheet and phone.' },
              { text: 'Distinct from the other directions', met: true, note: 'Cool palette now separates it from A.' },
            ],
            status: 'accepted',
            challenge: null,
          },
        ],
        views: [],
        mockups: [
          { label: 'Bus shelter 6-sheet', why: 'Main outdoor placement; seen at dusk on the way home.', art: mock('bus-shelter', posterC2) },
          { label: 'Phone story', why: 'Social placement named in the brief.', art: mock('phone', posterC2) },
          { label: 'Elevator screen', why: 'Office buildings on the Friday before the weekend.', art: mock('elevator', posterC2) },
        ],
      },
    ],
    similarity: [
      { pair: ['A', 'C'], level: 'medium', note: 'Both first visuals used a warm, low sun on a ridge.', action: 'C moved to blue hour; A keeps the frosty morning.' },
      { pair: ['A', 'B'], level: 'low', note: 'Landscape against texture.', action: 'None needed.' },
      { pair: ['B', 'C'], level: 'low', note: 'Product terrain against people at dusk.', action: 'None needed.' },
    ],
    conceptLimits: [],
  },
  contentReview: {
    checks: [
      { id: 'q1', question: 'Does it answer the brief?', outcome: 'pass', note: 'Ends with a recommended KV for the first cold weekend in every placement the brief names.' },
      { id: 'q2', question: 'Are research, conclusions, themes and visuals connected?', outcome: 'revised', note: 'Added the bridge from “the decision happens on a day” to the three directions.' },
      { id: 'q3', question: 'Do the transitions read naturally?', outcome: 'revised', note: 'Removed a second summary before the strategy.' },
      { id: 'q4', question: 'Is the language concise and brand-strategic?', outcome: 'revised', note: 'Research summary cut from 74 to 38 words.' },
      { id: 'q5', question: 'Are factual claims supported?', outcome: 'revised', note: 'Direction B subline “Built for any weather” was unsupported; replaced with “Tested for warmth”.' },
      { id: 'q6', question: 'Do images and copy say the same thing?', outcome: 'pass', note: 'Each slogan is legible in its own image.' },
      { id: 'q7', question: 'Are the three directions meaningfully different?', outcome: 'pass', note: 'Continuity, product-as-terrain, social dusk.' },
    ],
    narrative: [
      { id: 'n1', title: 'Opening', text: 'Every autumn there is one weekend when the cold arrives. This proposal is about owning that weekend.', before: null, changeReason: null },
      { id: 'n2', title: 'The question', text: 'How can Northline be the layer walkers think of before the first cold weekend, not after it?', before: null, changeReason: null },
      {
        id: 'n3',
        title: 'What we found',
        text: 'Walkers prepare on the first cold weekend, not on a date. Competitors arrive in November with summits and fabric. Nobody shows the familiar walk on the day it turns cold.',
        before: 'Our research, drawing on sample interviews with weekend walkers, a trade survey of outdoor retailers, conversations with store staff, a review of walking club newsletters and a window survey, indicates that walkers begin preparing for colder conditions following the first cold weekend of the season rather than at a fixed calendar date, while competitors tend to launch later.',
        changeReason: 'Too long; the sources belong in the notes.',
      },
      { id: 'n4', title: 'What it means', text: 'The decision happens on a day. That day is ordinary and social. Northline already speaks at that scale — so the cold has to be in the picture.', before: null, changeReason: null },
      {
        id: 'n5',
        title: 'Three directions',
        text: 'A keeps the path and changes the weather. B turns the layer into the landscape. C follows a group home as the dark comes in.',
        before: 'We developed three creative directions.',
        changeReason: 'Added a bridge so each direction is introduced by its idea.',
      },
      { id: 'n6', title: 'Recommendation', text: 'Lead with C outdoors and on social; use A in store windows where recognition matters most; keep B as the product-led alternative.', before: null, changeReason: null },
    ],
  },
  layout: {
    styles: [
      EDITORIAL_STYLE,
      COBALT_STYLE,
      STUDIO_STYLE,
    ],
    chosen: 'editorial',
    chosenBy: 'director',
    slides: [
      { id: 's1', kind: 'cover', lead: 'The first cold weekend', support: 'Northline autumn–winter KV · Proposal', art: posterC2, notes: '' },
      { id: 's2', kind: 'question', lead: 'How can Northline be the layer walkers think of before the first cold weekend — not after it?', support: 'The question this proposal answers', notes: '' },
      { id: 's3', kind: 'insight', lead: 'Walkers prepare on a day, not a date.', support: 'They check their kit on the first cold weekend and buy when they can picture the walk.', art: { kind: 'scene', scene: 'ridge-frost', palette: FROST, seed: 11, composition: 'close-up' }, notes: 'Sample interviews (qualitative).' },
      { id: 's4', kind: 'data', lead: '9 of 12', support: 'walkers said picturing a specific walk made a layer worth buying.', chart: undefined, bigNumber: '9/12', notes: 'Sample interviews, illustrative demo data.' },
      { id: 's5', kind: 'insight', lead: 'Competitors go up mountains — in November.', support: 'Summits and fabric callouts; nobody shows the familiar walk on the day it turns cold.', art: { kind: 'scene', scene: 'summit', palette: SUMMIT, seed: 2 }, notes: 'Six campaigns, desk review.' },
      { id: 's6', kind: 'conclusion', lead: 'Own the first cold weekend on a familiar route — and put the cold in the picture.', support: 'Category · Brand · Audience', notes: '' },
      { id: 's7', kind: 'theme', lead: 'Same path. Colder air.', support: 'A · First frost — the route stays, the season changes.', directionId: 'A', notes: '' },
      { id: 's8', kind: 'visual', lead: 'First frost', support: 'The path from last year’s KVs on its first frosty morning; the headline sits behind the ridge.', directionId: 'A', art: posterA, notes: '' },
      { id: 's9', kind: 'theme', lead: 'Every ridge, already layered.', support: 'B · Warm terrain — the product becomes the landscape.', directionId: 'B', notes: '' },
      { id: 's10', kind: 'visual', lead: 'Warm terrain', support: 'Frost picks out the fleece ridges; one walker gives scale.', directionId: 'B', art: posterB2, notes: '' },
      { id: 's11', kind: 'theme', lead: 'Out before the dark comes in.', support: 'C · Out before dark — the social walk home at blue hour.', directionId: 'C', notes: '' },
      { id: 's12', kind: 'visual', lead: 'Out before dark', support: 'The cold is in the sky; the warmth is only in the windows ahead.', directionId: 'C', art: posterC2, notes: '' },
      { id: 's13', kind: 'mockup', lead: 'On the way home', support: 'Bus shelter 6-sheet, seen at dusk.', directionId: 'C', art: mock('bus-shelter', posterC2), notes: '' },
      { id: 's14', kind: 'mockup', lead: 'In the window, early October', support: 'Where summer ranges still sit.', directionId: 'A', art: mock('store-window', posterA), notes: '' },
      { id: 's15', kind: 'comparison', lead: 'Three ways into the same weekend', support: 'Continuity · Product · People', notes: '' },
      { id: 's16', kind: 'recommendation', lead: 'Lead with C. Keep A for windows. Hold B as the product route.', support: 'Highest communication score, strongest audience evidence, clearest season.', directionId: 'C', art: posterC2, notes: '' },
    ],
    editability: {
      native: ['Every headline, line of copy and caption', 'Slide backgrounds, rules and colour fields', 'Charts, as native PowerPoint charts'],
      raster: ['Generated artwork and mockups, placed as replaceable images'],
    },
  },
  delivery: {
    checks: [
      { id: 'd1', area: 'Content integrity', outcome: 'pass', note: 'All 16 slides match the reviewed narrative.' },
      { id: 'd2', area: 'Visual hierarchy and consistency', outcome: 'pass', note: 'One lead element per slide.' },
      { id: 'd3', area: 'Image quality and cropping', outcome: 'fixed', note: 'Phone crop of C re-centred on the group.' },
      { id: 'd4', area: 'Text overflow and legibility', outcome: 'fixed', note: 'Direction B rationale shortened on slide 10.' },
      { id: 'd5', area: 'Mockups fit the intended use', outcome: 'pass', note: 'Outdoor, window, elevator and phone — all named in the brief.' },
      { id: 'd6', area: 'Rendering', outcome: 'pass', note: 'Checked in the exported file.' },
      { id: 'd7', area: 'Editability of the PPT', outcome: 'pass', note: 'Text, shapes and charts native; artwork as images.' },
    ],
    comparison: [
      { criterion: 'Creative mechanism', values: { A: 'Brand continuity', B: 'Product as landscape', C: 'Social occasion' } },
      { criterion: 'Lead line', values: { A: 'Same path. Colder air.', B: 'Every ridge, already layered.', C: 'Out before the dark comes in.' } },
      { criterion: 'Communication score', values: { A: '4.06', B: '4.04', C: '4.42' } },
      { criterion: 'Best placement', values: { A: 'Store windows', B: 'Elevator, close viewing', C: 'Outdoor and social' } },
      { criterion: 'Main risk', values: { A: 'Reads as last year', B: 'Abstract when small', C: 'Warmer than usual for the brand' } },
    ],
    recommendation: 'Lead with C, “Out before the dark comes in”, outdoors and on social; use A in store windows where recognition matters most; keep B as the product-led alternative you asked to preserve.',
    limitations: [
      'Artwork is generated demo illustration; final photography or illustration needs commissioning.',
      'Retail partner dates are unconfirmed, so placements are indicative.',
      'Audience evidence comes from one round of sample interviews.',
    ],
  },
  decisions: [
    { id: 'hd1', stage: 'themes', kind: 'chosen_despite_review', by: 'Alex Morgan', at: '2026-10-23T10:50:00Z', comment: 'Keep one bold product route. B stays.', reviewerPosition: 'Reviewers suggested replacing B with a lighter product idea (B scored 3.6 on clarity).' },
    { id: 'hd2', stage: 'themes', kind: 'approved', by: 'Alex Morgan', at: '2026-10-23T11:05:00Z', comment: 'Go ahead with A, B and C. Agree C leads.', reviewerPosition: null },
  ],
  contributions: [
    { id: 'uc1', stage: 'themes', kind: 'slogan', text: 'Back before the lights are on. Just.', borrow: null, by: 'Alex Morgan', at: '2026-10-23T10:40:00Z', status: 'used', response: 'Used as a secondary line for C.' },
  ],
  tasks: [
    { id: 't1', stage: 'brief', agent: 'Proposal Director', level: 'director', task: 'Extract the task card from the brief and list unknowns', status: 'done', startedAt: '2026-10-12T09:05:00Z', seconds: 41, receipt: 'rcpt_nl_brief_01' },
    { id: 't2', stage: 'research', agent: 'Research Lead', level: 'lead', task: 'Plan research for an existing-product seasonal KV', status: 'done', startedAt: '2026-10-14T09:00:00Z', seconds: 63, receipt: 'rcpt_nl_res_plan' },
    { id: 't3', stage: 'research', agent: 'Case Scout ×3', level: 'specialist', task: 'Parallel searches: archive KVs, competitor launches, seasonal cues', status: 'done', startedAt: '2026-10-14T09:02:00Z', seconds: 212, receipt: 'rcpt_nl_res_scouts' },
    { id: 't4', stage: 'strategy', agent: 'Strategy Lead', level: 'lead', task: 'Build the three-circle analysis and opportunities', status: 'done', startedAt: '2026-10-22T13:00:00Z', seconds: 180, receipt: 'rcpt_nl_strat' },
    { id: 't5', stage: 'themes', agent: 'Copy Lead', level: 'lead', task: 'Develop three directions by mechanism', status: 'done', startedAt: '2026-10-22T17:00:00Z', seconds: 240, receipt: 'rcpt_nl_copy' },
    { id: 't6', stage: 'themes', agent: 'Copy Evaluator', level: 'evaluator', task: 'Score communication criteria', status: 'done', startedAt: '2026-10-23T08:00:00Z', seconds: 55, receipt: 'rcpt_nl_copy_eval' },
    { id: 't7', stage: 'themes', agent: 'Copy Adversary', level: 'adversary', task: 'Challenge the positive judgements', status: 'done', startedAt: '2026-10-23T08:05:00Z', seconds: 48, receipt: 'rcpt_nl_copy_adv' },
    { id: 't8', stage: 'visual', agent: 'Reference Scout ×3', level: 'specialist', task: 'Reference searches per direction', status: 'done', startedAt: '2026-10-23T11:30:00Z', seconds: 190, receipt: 'rcpt_nl_refs' },
    { id: 't9', stage: 'visual', agent: 'Sketch Artist ×3', level: 'specialist', task: 'Three composition sketches per direction', status: 'done', startedAt: '2026-10-23T13:00:00Z', seconds: 300, receipt: 'rcpt_nl_sketch' },
    { id: 't10', stage: 'visual', agent: 'Visual Evaluator', level: 'evaluator', task: 'Rate refined visuals (threshold 4.0 + requirements)', status: 'done', startedAt: '2026-10-24T09:00:00Z', seconds: 70, receipt: 'rcpt_nl_vis_eval' },
    { id: 't11', stage: 'visual', agent: 'Renderer', level: 'specialist', task: 'Refine B to v2 after the seasonal-cue failure', status: 'done', startedAt: '2026-10-24T10:10:00Z', seconds: 160, receipt: 'rcpt_nl_vis_b2' },
    { id: 't12', stage: 'content_review', agent: 'Narrative Reviewer', level: 'evaluator', task: 'Review full content before layout', status: 'done', startedAt: '2026-10-24T14:30:00Z', seconds: 95, receipt: 'rcpt_nl_narr' },
    { id: 't13', stage: 'layout', agent: 'Layout Lead', level: 'lead', task: 'Three sample spreads; apply chosen style to 16 slides', status: 'done', startedAt: '2026-10-24T17:00:00Z', seconds: 420, receipt: 'rcpt_nl_layout' },
    { id: 't14', stage: 'delivery', agent: 'Render Checker', level: 'evaluator', task: 'Check the exported deck for overflow, crops and editability', status: 'done', startedAt: '2026-10-25T08:30:00Z', seconds: 88, receipt: 'rcpt_nl_render' },
  ],
  reviews: [
    { id: 'r1', stage: 'themes', subject: 'Direction A', evaluator: 'Copy Evaluator', average: avg(themeA), verdict: 'Passed', challenge: { claim: 'Brand integration 4.8', challenge: 'Could read as last year with frost.', resolution: 'Make the cold the subject.', outcome: 'partly_upheld' }, directorResolution: 'Keep; visual must carry the season.', at: '2026-10-23T08:10:00Z' },
    { id: 'r2', stage: 'themes', subject: 'Direction B', evaluator: 'Copy Evaluator', average: avg(themeB), verdict: 'Passed with notes', challenge: { claim: 'Differentiation 4.6', challenge: 'Abstract when small; “layered” risks a technical promise.', resolution: 'Subline limited to tested warmth.', outcome: 'upheld' }, directorResolution: 'Suggested replacing B. Overridden by your choice to keep it.', at: '2026-10-23T08:12:00Z' },
    { id: 'r3', stage: 'themes', subject: 'Direction C', evaluator: 'Copy Evaluator', average: avg(themeC), verdict: 'Passed', challenge: { claim: 'Audience resonance 4.7', challenge: 'A pub could imply drinking.', resolution: 'Village windows only.', outcome: 'partly_upheld' }, directorResolution: 'Recommend C.', at: '2026-10-23T08:14:00Z' },
    { id: 'r4', stage: 'visual', subject: 'B refined v1', evaluator: 'Visual Evaluator', average: avg(sB1), verdict: 'Below threshold: season not in the image', challenge: null, directorResolution: 'Returned to production with “put the cold in the terrain”.', at: '2026-10-24T09:20:00Z' },
    { id: 'r5', stage: 'visual', subject: 'C refined v1', evaluator: 'Visual Evaluator', average: avg(sC1), verdict: 'Passed alone; similar to A', challenge: { claim: 'Passes on its own', challenge: 'Same warm low sun as A.', resolution: 'Move to blue hour.', outcome: 'upheld' }, directorResolution: 'Revise for distinctness.', at: '2026-10-24T09:25:00Z' },
    { id: 'r6', stage: 'visual', subject: 'All refined v2', evaluator: 'Visual Evaluator', average: 4.43, verdict: 'Passed (A 4.40, B 4.10, C 4.56)', challenge: null, directorResolution: null, at: '2026-10-24T13:10:00Z' },
    { id: 'r7', stage: 'content_review', subject: 'Full narrative', evaluator: 'Narrative Reviewer', average: null, verdict: '4 revisions, 1 unsupported line removed', challenge: { claim: 'Narrative is coherent', challenge: 'The bridge from research to directions was missing.', resolution: 'Added.', outcome: 'upheld' }, directorResolution: 'Approved for layout.', at: '2026-10-24T16:00:00Z' },
    { id: 'r8', stage: 'delivery', subject: 'Rendered deck', evaluator: 'Render Checker', average: null, verdict: '2 fixes made; ready', challenge: null, directorResolution: 'Ready for your sign-off.', at: '2026-10-25T09:00:00Z' },
  ],
  handoffs: [
    { id: 'h1', from: 'research', to: 'strategy', producer: 'Research Lead', consumer: 'Strategy Lead', producerCheck: 'Released v1 with permitted uses and prohibited inferences.', consumerCheck: 'Accepted; audience claims kept directional.', status: 'accepted', at: '2026-10-22T11:30:00Z' },
    { id: 'h2', from: 'strategy', to: 'themes', producer: 'Strategy Lead', consumer: 'Copy Lead', producerCheck: 'Three opportunities, each tied to evidence.', consumerCheck: 'Each opportunity can carry a distinct mechanism.', status: 'accepted', at: '2026-10-22T16:45:00Z' },
    { id: 'h3', from: 'themes', to: 'visual', producer: 'Copy Lead', consumer: 'Visual Lead', producerCheck: 'Slogans final; B carries a reviewer note.', consumerCheck: 'Asked for the “no technical claims” rule in writing.', status: 'accepted', at: '2026-10-23T11:10:00Z' },
    { id: 'h4', from: 'visual', to: 'content_review', producer: 'Visual Lead', consumer: 'Proposal Director', producerCheck: 'All refined visuals ≥ 4.0 with requirements met.', consumerCheck: 'Similarity check attached.', status: 'accepted', at: '2026-10-24T13:20:00Z' },
    { id: 'h5', from: 'content_review', to: 'layout', producer: 'Proposal Director', consumer: 'Layout Lead', producerCheck: 'Narrative final, 6 sections.', consumerCheck: 'One lead element per slide agreed.', status: 'accepted', at: '2026-10-24T16:05:00Z' },
    { id: 'h6', from: 'layout', to: 'delivery', producer: 'Layout Lead', consumer: 'Proposal Director', producerCheck: '16 slides, editorial style.', consumerCheck: 'Two fixes requested and made.', status: 'accepted', at: '2026-10-25T08:20:00Z' },
  ],
  versions: [
    { id: 'v1', stage: 'brief', label: 'Task card', version: 1, inputs: ['Client brief', 'Retail calendar draft'], at: '2026-10-13T15:00:00Z', state: 'current', impact: null },
    { id: 'v2', stage: 'research', label: 'Research board', version: 1, inputs: ['Task card v1', '6 sources'], at: '2026-10-22T11:30:00Z', state: 'current', impact: null },
    { id: 'v3', stage: 'strategy', label: 'Strategy', version: 1, inputs: ['Research v1'], at: '2026-10-22T16:40:00Z', state: 'current', impact: null },
    { id: 'v4', stage: 'themes', label: 'Directions', version: 1, inputs: ['Strategy v1'], at: '2026-10-23T08:00:00Z', state: 'superseded', impact: null },
    { id: 'v5', stage: 'themes', label: 'Directions', version: 2, inputs: ['Strategy v1', 'Your slogan for C'], at: '2026-10-23T11:05:00Z', state: 'current', impact: null },
    { id: 'v6', stage: 'visual', label: 'Refined visuals', version: 2, inputs: ['Directions v2'], at: '2026-10-24T13:20:00Z', state: 'current', impact: null },
    { id: 'v7', stage: 'content_review', label: 'Narrative', version: 1, inputs: ['Strategy v1', 'Directions v2', 'Visuals v2'], at: '2026-10-24T16:00:00Z', state: 'current', impact: null },
    { id: 'v8', stage: 'layout', label: 'Deck · Editorial', version: 1, inputs: ['Narrative v1', 'Visuals v2'], at: '2026-10-25T08:10:00Z', state: 'current', impact: null },
  ],
  revision: 31,
  updatedAt: '2026-10-25T09:00:00Z',
};
