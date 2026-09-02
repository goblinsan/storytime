export const FAMILY_RELATIONSHIP_VOCABULARY = {
  PARENT: new Set(['parent', 'parent_of', 'father', 'mother', 'adoptive_parent', 'paternal', 'maternal']),
  CHILD: new Set(['child', 'child_of', 'son', 'daughter', 'adoptive_child', 'ward']),
  SPOUSE: new Set(['spouse', 'partner', 'married_to', 'wife', 'husband', 'betrothed', 'consort']),
  SIBLING: new Set(['sibling', 'brother', 'sister', 'half_sibling', 'twin']),
  ANCESTOR: new Set(['ancestor', 'forebear', 'progenitor', 'elder']),
  DESCENDANT: new Set(['descendant', 'offspring', 'heir', 'lineage']),
  FAMILY: new Set(['family', 'relative', 'clan', 'kin', 'house', 'protective_bond']),
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

function extractSurnameToken(name) {
  if (!name || typeof name !== 'string') return '';
  const clean = name.replace(/^(lord|lady|elder|ser|captain|admiral|grand|magistrate|chancellor)\s+/i, '').trim();
  const parts = clean.split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}

export function generateD3TreeData(members = []) {
  if (!members || members.length === 0) return null;

  const memberMap = new Map();
  for (const m of members) {
    memberMap.set(m.id, m);
  }

  // 1. Identify root nodes (nodes with 0 parents within this lineage)
  let roots = members.filter((m) => {
    if (!m.parents || m.parents.length === 0) return true;
    return !m.parents.some((pid) => memberMap.has(pid));
  });

  // If no clear roots (e.g. cycle), pick the earliest timeframe or principal member
  if (roots.length === 0) {
    const sorted = [...members].sort(
      (a, b) => (a.activeTimeframeStart || 9999) - (b.activeTimeframeStart || 9999)
    );
    roots = [sorted[0]];
  }

  // Recursive D3 tree node builder with cycle protection
  function buildNode(member, visitedBranch = new Set()) {
    if (visitedBranch.has(member.id)) {
      return {
        name: member.name,
        attributes: {
          id: member.id,
          role: member.role || '',
          importance: member.importance || 'supporting',
          isReference: true,
        },
      };
    }

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

    // Direct children in this lineage
    const childMembers = (member.children || [])
      .map((cid) => memberMap.get(cid))
      .filter(Boolean);

    const children = childMembers.map((c) => buildNode(c, nextBranch));

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
      children: children.length > 0 ? children : undefined,
    };
  }

  if (roots.length === 1) {
    return buildNode(roots[0]);
  }

  const surname = extractSurnameToken(members[0].name) || 'House';
  return {
    name: `${surname} Forebears`,
    attributes: {
      id: 'root-progenitors',
      role: 'Founding Ancestors',
      importance: 'background',
      timeframe: 'Historical Era',
      isSyntheticRoot: true,
    },
    children: roots.map((r) => buildNode(r)),
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

  // Group into connected family clusters
  const visited = new Set();
  const clusters = [];

  for (const char of charMap.values()) {
    if (visited.has(char.id)) continue;

    // Breadth-first search for connected family component
    const queue = [char.id];
    visited.add(char.id);
    const clusterMembers = [];

    while (queue.length > 0) {
      const currentId = queue.shift();
      const node = charMap.get(currentId);
      if (!node) continue;
      clusterMembers.push(node);

      const adjacent = [
        ...node.parents,
        ...node.children,
        ...node.spouses,
        ...node.siblings,
        ...node.kin,
      ];

      for (const neighborId of adjacent) {
        if (!visited.has(neighborId) && charMap.has(neighborId)) {
          visited.add(neighborId);
          queue.push(neighborId);
        }
      }
    }

    clusters.push(clusterMembers);
  }

  // Group loose individual characters by surname heuristic if they share a prominent house name
  const surnameGroups = new Map();
  const standalone = [];

  for (const cluster of clusters) {
    if (cluster.length === 1) {
      const single = cluster[0];
      const surname = extractSurnameToken(single.name);
      if (surname && surname.length > 2) {
        if (!surnameGroups.has(surname)) surnameGroups.set(surname, []);
        surnameGroups.get(surname).push(single);
      } else {
        standalone.push(single);
      }
    }
  }

  const finalLineages = [];

  // 1. Process connected multi-character clusters
  for (const cluster of clusters) {
    if (cluster.length <= 1) continue;

    const principal = cluster.find((m) => m.importance === 'principal' || m.isProtected) || cluster[0];
    const surname = extractSurnameToken(principal.name) || principal.name;

    const formattedMembers = cluster.map((m) => ({
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
      id: `lineage-${surname.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      name: `House ${surname}`,
      principalCharacterId: principal.id,
      memberCount: cluster.length,
      members: formattedMembers,
      d3Tree: generateD3TreeData(formattedMembers),
    });
  }

  // 2. Add surname clusters with 2+ members
  for (const [surname, members] of surnameGroups.entries()) {
    if (members.length > 1) {
      const formattedMembers = members.map((m) => ({
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
        id: `lineage-${surname.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name: `Clan ${surname}`,
        principalCharacterId: members[0].id,
        memberCount: members.length,
        members: formattedMembers,
        d3Tree: generateD3TreeData(formattedMembers),
      });
    } else {
      standalone.push(...members);
    }
  }

  // Sort lineages with principal characters first, then by member count
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
