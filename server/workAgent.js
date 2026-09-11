/**
 * Composing a work, and deciding what it is made of.
 *
 * Two different questions, asked differently.
 *
 * WHAT A WORK IS MADE OF proposes RECORDS -- the parts of a work, in order --
 * and each becomes a real part once somebody accepts it. It is handed the
 * work's premise, the parts it already has (so it proposes what is missing
 * rather than repeating them), the arcs of this universe (which are the shapes
 * a telling here already takes), and the cast and chronicle.
 *
 * COMPOSING A PART writes prose, and prose is continuous or it is nothing. So a
 * part is handed its place: the work it belongs to and that work's premise,
 * where the previous part ENDS -- its last lines, not its summary, because the
 * next sentence has to follow from the last one -- and what the next part is
 * meant to be, so this one arrives there instead of somewhere else.
 */
import { extractJson } from './canonAgent.js';

export const WORK_CANON_REQUEST = 'work_canon_request';
export const WORK_PARTS_REQUEST = 'work_parts_request';

const said = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

function fieldNotes(isPart) {
  return {
    description: isPart
      ? 'what happens in this part, as a short paragraph: the beats in order, and '
        + 'where it leaves things for the part after it'
      : 'what this work is, in two or three sentences: whose story it is, what is at '
        + 'stake, and what shape it takes',
    content: 'the prose of this part, complete and continuous, 1200 to 2000 words, '
      + 'in the voice of the parts around it. If the previous part is given, begin '
      + 'where it ends; if the next part is given, end where it begins. No headings, '
      + 'no summary, no notes to the reader',
  };
}

function context({ work, chain, before, after, children, cast, refs, arcs, direction, brief, arc, act }) {
  return [
    ...(direction?.persistentGoal?.trim() ? [`WHAT THIS UNIVERSE IS FOR: ${direction.persistentGoal.trim()}`, ''] : []),
    ...(direction?.guardrails?.length ? [
      'YOU ARE HELD TO THESE. They are not preferences:',
      ...direction.guardrails.map((rule) => `  - ${rule}`),
      '',
    ] : []),
    ...(brief?.trim() ? ['WHAT THE AUTHOR ASKED FOR. Hold to it:', brief.trim(), ''] : []),
    ...(chain.length ? [
      'THIS IS A PART OF:',
      ...chain.map((c) => `  - ${said(c.title)}${said(c.description) ? `: ${said(c.description).slice(0, 400)}` : ''}`),
      '',
    ] : []),
    `THIS ${chain.length ? 'PART' : 'WORK'}: ${work.title}${work.partNumber ? ` (part ${work.partNumber})` : ''}`,
    ...(said(work.description) ? [`WHAT IT IS MEANT TO BE: ${said(work.description)}`] : []),
    '',
    ...(before ? [
      `THE PART BEFORE IT: ${said(before.title)}`,
      ...(said(before.tail) ? ['IT ENDS LIKE THIS -- continue from here:', before.tail, ''] : ['']),
    ] : []),
    ...(after ? [`THE PART AFTER IT: ${said(after.title)}: ${said(after.description).slice(0, 400)}`, ''] : []),
    ...(children.length ? [
      'IT IS ALREADY MADE OF THESE PARTS, in order:',
      ...children.map((c) => `  ${c.partNumber ?? '-'}. ${said(c.title)}: ${said(c.description).slice(0, 200)}`),
      '',
    ] : []),
    ...(cast.length ? [
      'THE CAST:',
      ...cast.map((c) => `  - ${c.name}${said(c.role) ? ` (${said(c.role)})` : ''}${said(c.motivation) ? `: ${said(c.motivation).slice(0, 160)}` : ''}`),
      '',
    ] : []),
    ...(refs.length ? ['IT DRAWS ON: ' + refs.map((r) => r.name).filter(Boolean).join(', '), ''] : []),
    // The arc this work tells, in full: what it is about, what it keeps out,
    // and its acts and beats. Without a link it was handed every arc in the
    // universe as background, and left to guess which it was telling.
    ...(arc ? [
      `THIS WORK TELLS THE ARC "${said(arc.title)}". Hold to it:`,
      ...(said(arc.description) ? [`IN BRIEF: ${said(arc.description)}`] : []),
      ...(said(arc.throughline) ? [`THROUGHLINE: ${said(arc.throughline)}`] : []),
      ...(arc.outOfScope?.length ? ['KEPT OUT OF IT:', ...arc.outOfScope.map((r) => `  - ${said(r)}`)] : []),
      ...(arc.acts?.length ? [
        'ITS ACTS, in order:',
        ...arc.acts.flatMap((a) => [
          `  ${a.actNumber}. ${said(a.title) || 'Untitled'}${said(a.summary) ? `: ${said(a.summary).slice(0, 400)}` : ''}`,
          ...(a.beats ?? []).map((b) => `       - ${said(b).slice(0, 300)}`),
        ]),
      ] : []),
      '',
    ] : arcs.length ? [
      'THE ARCS OF THIS UNIVERSE:',
      ...arcs.map((a) => `  - ${said(a.title)}: ${said(a.description).slice(0, 240)}`),
      '',
    ] : []),
    ...(act ? [
      `THIS PART TELLS ACT ${act.actNumber}: ${said(act.title) || 'Untitled'}`,
      ...(said(act.summary) ? [`WHAT THE ACT DOES: ${said(act.summary)}`] : []),
      ...(act.beats?.length ? ['ITS BEATS, which this part carries:', ...act.beats.map((b) => `  - ${said(b)}`)] : []),
      '',
    ] : []),
  ];
}

export function buildWorkPrompt(input) {
  const { work, fields, previous, note, chain, revise } = input;
  const notes = fieldNotes(chain.length > 0);
  const asked = fields.filter((f) => notes[f]);
  // Prose keeps its paragraphs, and all of it: revising a chapter from its
  // first four thousand characters, run together, would hand back a chapter
  // with the rest missing.
  const written = asked
    .map((f) => [f, f === 'content' ? String(work.content ?? '').trim() : said(work[f])])
    .filter(([, v]) => v);
  const proseOnly = asked.length === 1 && asked[0] === 'content';
  const revising = proseOnly && Boolean(revise || note) && Boolean(String(work.content ?? '').trim());
  return {
    asked,
    prompt: [
      'You are writing part of a work set in an existing universe. Use the people,',
      'places and events that are recorded; do not invent new principal characters.',
      '',
      ...context(input),
      ...(revising ? [
        'THIS PART IS WRITTEN. Revise it as the author asks, and only as they ask: every paragraph',
        'they did not ask to change stays as it is. Return the whole part, not the changed passages.',
        '',
        'THE PART AS IT STANDS:',
        String(work.content ?? '').trim().slice(0, 40000),
        '',
      ] : written.length ? [
        'SOME OF THESE ARE ALREADY WRITTEN. Improve them and keep what is good; if a',
        'field is already right, return it unchanged.',
        ...written.map(([f, v]) => `CURRENT ${f}: ${v.slice(0, 4000)}`),
        '',
      ] : []),
      ...(previous && note ? [
        'YOU ALREADY PROPOSED THIS, AND IT WAS SENT BACK:',
        ...Object.entries(previous).map(([f, v]) => `  ${f}: ${String(v).slice(0, 3000)}`),
        '',
        `WHAT THEY SAID: ${note}`,
        '',
        'Answer that. Change what they objected to; keep what they did not.',
        '',
      ] : []),
      ...(revising ? [
        'Answer with the revised part itself and nothing else: no JSON, no title, no preface, no notes.',
        'Separate paragraphs with a blank line.',
      ] : proseOnly ? [
        `WRITE ${notes.content}.`,
        '',
        'Answer with the prose itself and nothing else: no JSON, no title, no preface,',
        'no word count. Separate paragraphs with a blank line.',
      ] : [
        'Answer with JSON and nothing else. Escape line breaks inside strings as \\n.',
        '{',
        ...asked.map((f, i) => `  "${f}": "..."${i < asked.length - 1 ? ',' : ''}   // ${notes[f]}`),
        '}',
      ]),
    ].join('\n'),
  };
}

/**
 * What the agent answered, as fields.
 *
 * Prose is asked for as prose. Wrapped in JSON, 1,500 words had to come back as
 * one escaped string, and twice the reply held no JSON object at all -- the
 * agent had simply written the chapter -- so the answer was thrown away and the
 * part said "composing" for good. A JSON answer is still read if one comes.
 */
export function readWorkAnswer(raw, asked) {
  // extractJson throws on a reply with no object in it, which is exactly what
  // a chapter written as asked is.
  let json = null;
  try { json = extractJson(raw); } catch { json = null; }
  const parsed = checkWorkAnswer(json, asked);
  if (parsed) return parsed;
  if (!(asked.length === 1 && asked[0] === 'content')) return null;
  const prose = String(raw ?? '').replace(/```[a-z]*\n?/gi, '').trim()
    .replace(/^#+ .*\n+/, '')
    .trim();
  // Less than this is an apology or a question, not a part.
  return prose.split(/\s+/).length >= 200 ? { content: prose } : null;
}

export function checkWorkAnswer(proposed, asked) {
  if (!proposed || typeof proposed !== 'object') return null;
  const kept = {};
  for (const field of asked) {
    const value = proposed[field];
    if (typeof value === 'string' && value.trim()) kept[field] = value.trim();
  }
  return Object.keys(kept).length ? kept : null;
}

export function buildWorkPartsPrompt(input) {
  const { note, previous } = input;
  return {
    prompt: [
      'You are deciding what parts a work is made of: its chapters, acts or',
      'episodes, in the order they come. Each part you propose becomes a real part',
      'of the work once it is accepted.',
      '',
      ...context(input),
      ...(input.children.length ? [
        'Propose only what is MISSING -- parts that come before, between or after',
        'the ones above -- and never a part that is one of them under another name.',
        '',
      ] : []),
      // Sent back with a reason: the agent sees its own list and the objection,
      // so the next pass is a revision rather than a fresh guess.
      ...(previous?.parts?.length && note?.trim() ? [
        'YOU ALREADY PROPOSED THESE, AND THEY WERE SENT BACK:',
        ...previous.parts.map((p, i) => `  ${i + 1}. ${said(p.title)}: ${said(p.description).slice(0, 300)}`),
        '',
        `WHAT THEY SAID: ${note.trim()}`,
        '',
        'Answer that. Change what they objected to; keep what they did not.',
        '',
      ] : note?.trim() ? [`WHAT THEY ASKED FOR: ${note.trim()}`, ''] : []),
      ...(input.arc?.acts?.length ? [
        'Tell the arc above: propose parts that carry its acts in order -- one part to an act, or',
        'several where an act needs the room -- and say which act each part tells.',
        '',
        'Answer with JSON and nothing else:',
        '{ "parts": [ { "title": "...", "description": "what happens in it, in a short paragraph", "act": 1 } ] }',
      ] : [
        'Answer with JSON and nothing else:',
        '{ "parts": [ { "title": "...", "description": "what happens in it, in a short paragraph" } ] }',
      ]),
    ].join('\n'),
  };
}

export function checkWorkPartsAnswer(proposed) {
  const parts = Array.isArray(proposed?.parts) ? proposed.parts : [];
  const kept = parts
    .map((p) => ({
      title: said(p?.title),
      description: said(p?.description),
      // Which act of the arc it tells, when the work is built from one.
      ...(Number.isInteger(Number(p?.act)) && Number(p?.act) > 0 ? { act: Number(p.act) } : {}),
    }))
    .filter((p) => p.title);
  return kept.length ? { parts: kept } : null;
}
