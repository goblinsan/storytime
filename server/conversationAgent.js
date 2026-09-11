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
