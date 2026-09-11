/**
 * Talking a record over, before anything is written.
 *
 * Every other agent here answers with fields to put in force. This one
 * answers a question, in words, and changes nothing: the author asks what is
 * known, what would fit, what is missing, and decides from the answer what to
 * ask for. When they do ask for changes, the conversation goes with the
 * request as its brief, so the proposal follows from what was said.
 */
import { clip } from './recordContext.js';

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
    'Answer with JSON and nothing else:',
    '{ "records": [ { "kind": "one of the kinds above", "name": "...", '
      + '"inside": "for a place or an event, the name of an existing place or event it belongs inside, or empty", '
      + '"brief": "one or two sentences: what it is, as the conversation has it" } ] }',
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
    kept.push({ kind, name, inside: said(r?.inside).slice(0, 120), brief: said(r?.brief).slice(0, 600) });
    if (kept.length === 8) break;
  }
  return kept;
}
