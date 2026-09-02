export const FAMILY_RELATIONSHIP_VOCABULARY = {
  PARENT: new Set(['parent', 'parent_of', 'father', 'mother', 'adoptive_parent', 'paternal', 'maternal']),
  CHILD: new Set(['child', 'child_of', 'son', 'daughter', 'adoptive_child', 'ward']),
  SPOUSE: new Set(['spouse', 'partner', 'married_to', 'wife', 'husband', 'betrothed', 'consort']),
  SIBLING: new Set(['sibling', 'brother', 'sister', 'half_sibling', 'twin']),
  ANCESTOR: new Set(['ancestor', 'forebear', 'progenitor', 'elder']),
  DESCENDANT: new Set(['descendant', 'offspring', 'heir', 'lineage']),
  FAMILY: new Set(['family', 'relative', 'clan', 'kin', 'house', 'protective_bond', 'guardian_of']),
};

export function normalizeFamilyRelation(relType) {
  if (!relType || typeof relType !== 'string') return null;
  const t = relType.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (FAMILY_RELATIONSHIP_VOCABULARY.PARENT.has(t)) return 'parent';
  if (FAMILY_RELATIONSHIP_VOCABULARY.CHILD.has(t)) return 'child';
  if (FAMILY_RELATIONSHIP_VOCABULARY.SPOUSE.has(t)) return 'spouse';
  if (FAMILY_RELATIONSHIP_VOCABULARY.SIBLING.has(t)) return 'sibling';
  if (FAMILY_RELATIONSHIP_VOCABULARY.ANCESTOR.has(t)) return 'ancestor';
  if (FAMILY_RELATIONSHIP_VOCABULARY.DESCENDANT.has(t)) return 'descendant';
  if (FAMILY_RELATIONSHIP_VOCABULARY.FAMILY.has(t)) return 'family';
  return null;
}

export function extractSurnameToken(name) {
  if (!name || typeof name !== 'string') return '';
  let clean = name.replace(/^(lord|lady|elder|ser|captain|admiral|grand|magistrate|chancellor)\s+/i, '').trim();
  clean = clean.replace(/\s+(senior|junior|jr\.?|sr\.?|ii|iii|iv)$/i, '').trim();
  if (/\bof the\b/i.test(clean)) {
    return ''; // Skip location/title based names like 'Lyra of the Outer Rim'
  }
  const parts = clean.split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}

export function generateD3TreeData(members = []) {
  if (!members || members.length === 0) return null;

  const memberMap = new Map();
  for (const m of members) {
    memberMap.set(m.id, m);
  }

  // Global tracker so each character appears AT MOST ONCE in the tree canvas
  const placedCharIds = new Set();

  function buildMemberNode(member, visitedBranch = new Set()) {
    if (!member || visitedBranch.has(member.id)) {
      return null;
    }

    placedCharIds.add(member.id);
    const nextBranch = new Set(visitedBranch);
    nextBranch.add(member.id);

    const spouseNames = (member.spouses || [])
      .map((sid) => memberMap.get(sid)?.name)
      .filter(Boolean);

    const parentNames = (member.parents || [])
      .map((pid) => memberMap.get(pid)?.name)
      .filter(Boolean);

    const timeframeStr =
      member.activeTimeframeStart != null || member.activeTimeframeEnd != null
        ? `${member.activeTimeframeStart ?? '?'}-${member.activeTimeframeEnd ?? 'Now'}`
        : '';

    // Direct children in this lineage who have not yet been placed
    const unplacedChildren = (member.children || [])
      .map((cid) => memberMap.get(cid))
      .filter((c) => c && !placedCharIds.has(c.id));

    const childrenNodes = [];
    for (const child of unplacedChildren) {
      const node = buildMemberNode(child, nextBranch);
      if (node) childrenNodes.push(node);
    }

    return {
      name: member.name,
      attributes: {
        id: member.id,
        role: member.role || '',
        importance: member.importance || 'supporting',
        characterType: member.characterType || 'story',
        timeframe: timeframeStr,
        isProtected: Boolean(member.isProtected),
        spouses: spouseNames.join(', '),
        parents: parentNames.join(', '),
      },
      children: childrenNodes.length > 0 ? childrenNodes : undefined,
    };
  }

  // 1. Find true genealogical roots (characters with children or spouses, but no parents in this lineage)
  const connectedRoots = members.filter((m) => {
    const hasParent = m.parents && m.parents.some((pid) => memberMap.has(pid));
    if (hasParent) return false;
    const hasFamily = (m.children && m.children.length > 0) || (m.spouses && m.spouses.length > 0);
    return hasFamily;
  });

  // Sort connected roots: principal actors first, then earlier active timeframe
  connectedRoots.sort((a, b) => {
    if (a.importance === 'principal' && b.importance !== 'principal') return -1;
    if (b.importance === 'principal' && a.importance !== 'principal') return 1;
    return (a.activeTimeframeStart || 9999) - (b.activeTimeframeStart || 9999);
  });

  // Build root trees
  const primaryRootNodes = [];
  for (const root of connectedRoots) {
    if (!placedCharIds.has(root.id)) {
      const node = buildMemberNode(root);
      if (node) primaryRootNodes.push(node);
    }
  }

  // 2. Any remaining unplaced members (e.g. extended relatives / standalone kin)
  const remainingMembers = members.filter((m) => !placedCharIds.has(m.id));

  // If we have remaining members, group them cleanly
  const extendedNodes = [];
  for (const m of remainingMembers) {
    if (!placedCharIds.has(m.id)) {
      const node = buildMemberNode(m);
      if (node) extendedNodes.push(node);
    }
  }

  const surname = extractSurnameToken(members[0]?.name) || 'House';

  // If exactly one primary root with no extended orphans, return it directly
  if (primaryRootNodes.length === 1 && extendedNodes.length === 0) {
    return primaryRootNodes[0];
  }

  // Combine into a clean Progenitor root
  const allBranches = [...primaryRootNodes];
  if (extendedNodes.length > 0) {
    if (primaryRootNodes.length > 0) {
      allBranches.push({
        name: `${surname} Extended Kin`,
        attributes: {
          id: 'branch-extended-kin',
          role: 'Historical Relatives & Lineage Branches',
          importance: 'background',
          timeframe: 'Ancestral Line',
          isSyntheticRoot: true,
        },
        children: extendedNodes,
      });
    } else {
      allBranches.push(...extendedNodes);
    }
  }

  return {
    name: `${surname} Progenitors`,
    attributes: {
      id: 'root-progenitors',
      role: 'Clan Founders & Forebears',
      importance: 'background',
      timeframe: 'Historical Era',
      isSyntheticRoot: true,
    },
    children: allBranches,
  };
}

export function buildFamilyTrees(characters = [], relationships = []) {
  const charMap = new Map();
  for (const c of characters) {
    charMap.set(c.id, {
      id: c.id,
      name: c.name,
      role: c.role || '',
      importance: c.importance || 'supporting',
      characterType: c.character_type || c.characterType || 'story',
      activeTimeframeStart: c.active_timeframe_start ?? c.activeTimeframeStart ?? null,
      activeTimeframeEnd: c.active_timeframe_end ?? c.activeTimeframeEnd ?? null,
      isProtected: Boolean(c.is_protected ?? c.isProtected),
      parents: new Set(),
      children: new Set(),
      spouses: new Set(),
      siblings: new Set(),
      kin: new Set(),
    });
  }

  // Parse pairwise canon relationships
  for (const rel of relationships) {
    const norm = normalizeFamilyRelation(rel.relationship_type || rel.relationshipType);
    if (!norm) continue;

    const source = charMap.get(rel.source_entity_id || rel.sourceEntityId);
    const target = charMap.get(rel.target_entity_id || rel.targetEntityId);
    if (!source || !target || source.id === target.id) continue;

    switch (norm) {
      case 'parent':
        source.children.add(target.id);
        target.parents.add(source.id);
        break;
      case 'child':
        source.parents.add(target.id);
        target.children.add(source.id);
        break;
      case 'spouse':
        source.spouses.add(target.id);
        target.spouses.add(source.id);
        break;
      case 'sibling':
        source.siblings.add(target.id);
        target.siblings.add(source.id);
        break;
      case 'ancestor':
        source.children.add(target.id);
        target.parents.add(source.id);
        break;
      case 'descendant':
        source.parents.add(target.id);
        target.children.add(source.id);
        break;
      case 'family':
      default:
        source.kin.add(target.id);
        target.kin.add(source.id);
        break;
    }
  }

  // Group characters UNIFIED by House / Clan token!
  // E.g. All Vanes into 'vane', all Rens into 'ren', all Sunders into 'sunder', all Zephyrines into 'zephyrine'
  const clanBuckets = new Map();
  const standalone = [];

  for (const char of charMap.values()) {
    const surname = extractSurnameToken(char.name);
    if (!surname || surname.length < 2) {
      standalone.push(char);
      continue;
    }

    const key = surname.toLowerCase();
    if (!clanBuckets.has(key)) {
      clanBuckets.set(key, {
        token: surname,
        members: new Map(),
      });
    }
    clanBuckets.get(key).members.set(char.id, char);
  }

  const finalLineages = [];

  for (const [key, bucket] of clanBuckets.entries()) {
    const memberList = Array.from(bucket.members.values());
    if (memberList.length < 2) {
      standalone.push(...memberList);
      continue;
    }

    // Determine clan title
    const hasNobility = memberList.some((m) =>
      /^(lord|lady|high|arch)\s+/i.test(m.name) || m.name.toLowerCase().includes('vane') || m.name.toLowerCase().includes('zephyrine')
    );
    const prefix = hasNobility ? 'House' : 'Clan';
    const lineageName = `${prefix} ${bucket.token}`;

    const principal = memberList.find((m) => m.importance === 'principal' || m.isProtected) || memberList[0];

    const formattedMembers = memberList.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      importance: m.importance,
      characterType: m.characterType,
      activeTimeframeStart: m.activeTimeframeStart,
      activeTimeframeEnd: m.activeTimeframeEnd,
      isProtected: m.isProtected,
      parents: Array.from(m.parents),
      children: Array.from(m.children),
      spouses: Array.from(m.spouses),
      siblings: Array.from(m.siblings),
    }));

    finalLineages.push({
      id: `lineage-${key}`,
      name: lineageName,
      principalCharacterId: principal.id,
      memberCount: memberList.length,
      members: formattedMembers,
      d3Tree: generateD3TreeData(formattedMembers),
    });
  }

  // Sort lineages with principal characters first, then member count
  finalLineages.sort((a, b) => {
    const aHasPrincipal = a.members.some((m) => m.importance === 'principal');
    const bHasPrincipal = b.members.some((m) => m.importance === 'principal');
    if (aHasPrincipal && !bHasPrincipal) return -1;
    if (!aHasPrincipal && bHasPrincipal) return 1;
    return b.memberCount - a.memberCount;
  });

  return {
    lineages: finalLineages,
    standaloneCount: standalone.length,
  };
}
