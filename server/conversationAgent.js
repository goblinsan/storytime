/**
 * Talking a record over, before anything is written.
 *
 * Every other agent here answers with fields to put in force. This one
 * answers a question, in words, and changes nothing: the author asks what is
 * known, what would fit, what is missing, and decides from the answer what to
 * ask for. When they do ask for changes, the conversation goes with the
 * request as its brief, so the proposal follows from what was said.
 */
// Its own copy of clip: importing it from recordContext brought the database
// along, and a prompt builder should be testable without one.
const clip = (value, most) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > most ? `${text.slice(0, most)}…` : text;
};
import { readEdge } from './tieWords.js';

const said = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** A field's key, as words: "ecologicalNiche" is "ecological niche". */
const inWords = (key) => String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();

export function buildConversationPrompt({ record, index, direction = {}, focus = [], thread = [], question }) {
  const tieName = (id) => index.names.get(id) ?? id;
  return [
    `You are a collaborator on a worldbuilding universe. The author is working on the ${record.word} `
      + `"${record.name}" and is talking it over with you.`,
    'Answer from what is recorded below. When something is not recorded, say so plainly; if an idea would',
    'help, offer one, and say that it is a suggestion rather than canon. Answer in a few sentences, or a',
    'short list when the question asks for several things. No JSON and no headings.',
    'You change nothing by answering. When the author wants changes, they ask for a proposal separately.',
    '',
    ...(said(direction.goal) ? [`WHAT THIS UNIVERSE IS FOR: ${said(direction.goal)}`] : []),
    ...(direction.guardrails?.length ? ['IT IS HELD TO THESE:', ...direction.guardrails.map((r) => `  - ${said(r)}`)] : []),
    '',
    `THE ${record.word.toUpperCase()}: ${record.name}`,
    ...record.fields.map((f) => `${f.label}: ${f.value}`),
    ...(record.ties?.length ? [
      '',
      'ITS TIES:',
      ...record.ties.map((t) => `  - ${tieName(t.source)} ${inWords(t.type)} ${tieName(t.target)}${t.notes ? `: ${clip(t.notes, 200)}` : ''}`),
    ] : []),
    ...(focus.length ? ['', `THE AUTHOR IS LOOKING AT: ${focus.map(inWords).join(', ')}`] : []),
    '',
    'EVERYTHING ELSE RECORDED IN THIS UNIVERSE, by name:',
    ...index.lines,
    ...(thread.length ? [
      '',
      'THE CONVERSATION SO FAR:',
      ...thread.slice(-12).map((t) => `${t.role === 'agent' ? 'You' : 'Author'}: ${clip(t.text, 1500)}`),
    ] : []),
    '',
    `THE AUTHOR ASKS: ${said(question)}`,
  ].join('\n');
}

/**
 * The ties a new person or group can be given, in the words every surface
 * reads them in: "X sibling of Y". The graph only ties people and groups, so
 * those are the records that get ties.
 */
export const TIE_KINDS = [
  'parent_of', 'child_of', 'sibling', 'spouse', 'family', 'ancestor', 'guardian_of',
  'protective_bond', 'resemblance', 'member_of', 'uneasy_alliance',
  'hostile', 'feud', 'active_skirmish', 'cold_war', 'trade_war',
];
export const TIED_KINDS = new Set(['character', 'society']);

/** What each kind of record is, for the prompt that proposes new ones. */
export const NEW_RECORD_KINDS = {
  character: 'a person',
  place: 'a place: a world, a station, a street, a room',
  event: 'something that happened, on the chronicle',
  society: 'a group: a faction, a guild, a family, a people',
  creature: 'a creature, for the bestiary',
  technology: 'something that can be built or used',
  arc: 'a story arc: the shape a telling takes',
  work: 'a work: a story, a novel, a screenplay',
  act: 'an act of this arc',
  part: 'a part of this work: a chapter',
};

/**
 * Proposing records to make, from a conversation.
 *
 * It proposes names and what each thing is, and where it goes. It writes no
 * record: once somebody chooses which to make, each is made the way its own
 * surface makes one, and its fields are asked for as proposals like any other.
 */
export function buildNewRecordsPrompt({ record, index, direction = {}, thread = [], request = '', kinds }) {
  return [
    `You are a collaborator on a worldbuilding universe. The author has been talking over the ${record.word} `
      + `"${record.name}" with you, and wants new records made from that conversation.`,
    'Propose only what the conversation calls for: usually one to three records, never more than eight.',
    'Propose only records that do not exist yet. Everything already recorded is listed below by name; none',
    'of those may be proposed again, under that name or another.',
    '',
    ...(said(direction.goal) ? [`WHAT THIS UNIVERSE IS FOR: ${said(direction.goal)}`] : []),
    ...(direction.guardrails?.length ? ['IT IS HELD TO THESE:', ...direction.guardrails.map((r) => `  - ${said(r)}`)] : []),
    '',
    `THE ${record.word.toUpperCase()}: ${record.name}`,
    ...record.fields.map((f) => `${f.label}: ${f.value}`),
    '',
    'EVERYTHING ALREADY RECORDED IN THIS UNIVERSE, by name:',
    ...index.lines,
    ...(thread.length ? [
      '',
      'THE CONVERSATION:',
      ...thread.slice(-12).map((t) => `${t.role === 'agent' ? 'You' : 'Author'}: ${clip(t.text, 1500)}`),
    ] : []),
    ...(said(request) ? ['', `WHAT THE AUTHOR ASKS FOR NOW: ${said(request)}`] : []),
    '',
    'THE KINDS OF RECORD YOU MAY PROPOSE:',
    ...kinds.map((k) => `  ${k}: ${NEW_RECORD_KINDS[k]}`),
    '',
    'A new person or group can be tied to a person or group that exists, or to another you propose:',
    'give each tie only where the conversation says it. The kinds of tie, read as "new record ... other":',
    ...TIE_KINDS.map((k) => `  ${k}: ${readEdge(k, true)}`),
    '',
    'Answer with JSON and nothing else:',
    '{ "records": [ { "kind": "one of the kinds above", "name": "...", '
      + '"inside": "for a place or an event, the name of an existing place or event it belongs inside, or empty", '
      + '"brief": "one or two sentences: what it is, as the conversation has it", '
      + '"ties": [ { "to": "the name of a person or group", "kind": "one of the kinds of tie", '
      + '"note": "a few words, or empty" } ] } ] }',
  ].join('\n');
}

/** Keep what can be made: a known kind, a name, not already recorded, once each. */
export function checkNewRecords(proposed, { kinds, existing }) {
  const list = Array.isArray(proposed?.records) ? proposed.records : [];
  const seen = new Set(existing);
  const kept = [];
  for (const r of list) {
    const kind = said(r?.kind).toLowerCase();
    const name = said(r?.name).slice(0, 120);
    if (!kinds.includes(kind) || !name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    // Ties for a person or a group only, of a kind every surface can read.
    const ties = TIED_KINDS.has(kind) && Array.isArray(r?.ties)
      ? r.ties
        .map((t) => ({ to: said(t?.to).slice(0, 120), kind: said(t?.kind).toLowerCase(), note: said(t?.note).slice(0, 200) }))
        .filter((t) => t.to && TIE_KINDS.includes(t.kind) && t.to.toLowerCase() !== name.toLowerCase())
        .slice(0, 5)
      : [];
    kept.push({ kind, name, inside: said(r?.inside).slice(0, 120), brief: said(r?.brief).slice(0, 600), ties });
    if (kept.length === 8) break;
  }
  return kept;
}

/**
 * What changes a conversation settled on, across a record and its parts.
 *
 * "Propose changes" on a work asked for the work's own fields, which for a
 * story made of chapters is its one-paragraph brief -- so a review that named
 * three chapters produced a new brief and nothing else. The plan names each
 * part the conversation calls to change, which field, and what exactly to
 * change; each becomes its own request, carrying that instruction.
 */
export const PLAN_FIELDS = {
  work: { self: { description: 'what the work is, in brief' },
    part: { description: 'what happens in the part', content: 'the part\'s prose' } },
  arc: { self: { description: 'the arc in brief', throughline: 'its throughline', outOfScope: 'what it keeps out' },
    part: { summary: 'what the act does', beats: 'the act\'s beats' } },
};

export function buildChangePlanPrompt({ kind, record, parts, thread = [], request = '', selfFields }) {
  const spec = PLAN_FIELDS[kind];
  const self = selfFields ?? spec.self;
  const unit = kind === 'arc' ? 'act' : 'part';
  return [
    `You are a collaborator on a worldbuilding universe. The author has talked over the ${record.word} `
      + `"${record.name}" with you, and now wants the changes that conversation settled on -- to the `
      + `${record.word} itself and to any of its ${unit}s it named.`,
    'Decide which need changing and say, for each, exactly what to change. Only what the conversation asks',
    'for: leave everything else alone. A change you are unsure the author wanted is not one to make.',
    '',
    `THE ${record.word.toUpperCase()}: ${record.name}`,
    ...record.fields.map((f) => `${f.label}: ${f.value}`),
    '',
    `ITS ${unit.toUpperCase()}S, by number:`,
    ...parts.map((p) => `  ${p.number}. ${said(p.title) || 'Untitled'}${said(p.summary) ? `: ${clip(p.summary, 300)}` : ''}`
      + `${p.words ? ` (${p.words} words written)` : ''}`),
    ...(thread.length ? [
      '',
      'THE CONVERSATION:',
      ...thread.slice(-14).map((t) => `${t.role === 'agent' ? 'You' : 'Author'}: ${clip(t.text, 2500)}`),
    ] : []),
    ...(said(request) ? ['', `WHAT THE AUTHOR ASKS FOR NOW: ${said(request)}`] : []),
    '',
    `WHAT CAN BE CHANGED. For the ${record.word} itself (number 0): `
      + Object.entries(self).map(([k, v]) => `"${k}" (${v})`).join(', ') + '.',
    `For a ${unit} (its number): ` + Object.entries(spec.part).map(([k, v]) => `"${k}" (${v})`).join(', ') + '.',
    '',
    'Answer with JSON and nothing else:',
    `{ "changes": [ { "${unit}": 0, "fields": ["..."], "instruction": "what to change, specifically, in one to three sentences" } ] }`,
  ].join('\n');
}

/** Keep changes to a real target, in a field it has, with something to do. */
export function checkChangePlan(proposed, { kind, numbers, selfFields }) {
  const spec = PLAN_FIELDS[kind];
  const self = selfFields ?? spec.self;
  const unit = kind === 'arc' ? 'act' : 'part';
  const list = Array.isArray(proposed?.changes) ? proposed.changes : [];
  const kept = [];
  for (const change of list) {
    const number = Number(change?.[unit] ?? change?.part ?? change?.act);
    if (!Number.isInteger(number) || (number !== 0 && !numbers.includes(number))) continue;
    const allowed = number === 0 ? self : spec.part;
    const fields = (Array.isArray(change?.fields) ? change.fields : []).map(String).filter((f) => allowed[f]);
    const instruction = said(change?.instruction).slice(0, 1200);
    if (!fields.length || !instruction) continue;
    kept.push({ number, fields: [...new Set(fields)], instruction });
    if (kept.length === 12) break;
  }
  return kept;
}
