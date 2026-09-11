import { editorialApi, type OfferedRecord } from './api';
import { universeSectionPath, type UniverseSection } from './paths';

/**
 * Making the records a conversation proposed, the way each surface's New
 * makes one -- so a character keeps its duplicate check, a place its parent,
 * an event the year read out of its date -- and saying where each now lives.
 */

const WORDS: Record<string, string> = {
  character: 'character', place: 'place', event: 'event', society: 'group', creature: 'creature',
  technology: 'technology', arc: 'arc', act: 'act', work: 'work', part: 'part',
};

export const kindWord = (kind: string) => WORDS[kind] ?? kind;

export async function makeRecord(projectId: string, r: OfferedRecord): Promise<string> {
  switch (r.kind) {
    case 'character': return (await editorialApi.createCharacter(projectId, r.name)).id;
    case 'place': return String((await editorialApi.createPlace(projectId, { name: r.name, parentId: r.parentId })).id);
    case 'event': {
      const made = await editorialApi.createEvent(projectId, r.name);
      if (r.parentId) await editorialApi.updateEvent(made.id, { parentId: r.parentId });
      return made.id;
    }
    case 'society': return (await editorialApi.createSociety(projectId, r.name)).id;
    case 'creature': return (await editorialApi.createCreature(projectId, r.name)).id;
    case 'technology': return (await editorialApi.createTechnology(projectId, r.name)).id;
    case 'arc': return (await editorialApi.createArc(projectId, r.name)).id;
    case 'work': return (await editorialApi.createWork(projectId, r.name)).id;
    case 'act':
      if (!r.parentId) throw new Error('an act needs its arc');
      return (await editorialApi.createArcAct(r.parentId, r.name)).id;
    case 'part':
      if (!r.parentId) throw new Error('a part needs its work');
      return (await editorialApi.createWorkPart(r.parentId, r.name, r.brief)).id;
    default:
      throw new Error(`nothing here makes a ${r.kind}`);
  }
}

const WHERE: Record<string, [UniverseSection, string]> = {
  character: ['characters', 'who'], place: ['geography', 'place'], event: ['timeline', 'open'],
  society: ['societies', 'open'], creature: ['bestiary', 'open'], technology: ['technologies', 'open'],
  arc: ['arcs', 'open'], work: ['works', 'open'], part: ['works', 'open'],
};

/** Where a made record lives in the site. An act opens the arc it is in. */
export function recordPath(projectId: string, kind: string, id: string, parentId: string | null): string {
  if (kind === 'act') return `${universeSectionPath(projectId, 'arcs')}?open=${encodeURIComponent(parentId ?? '')}`;
  const [section, param] = WHERE[kind] ?? ['encyclopedia', 'open'];
  return `${universeSectionPath(projectId, section)}?${param}=${encodeURIComponent(id)}${kind === 'character' ? '&cast=all' : ''}`;
}
