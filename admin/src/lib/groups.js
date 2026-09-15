// Client-side "suggested groups" heuristic. There is no backend grouping
// engine yet (that's real business logic -- size-range compatibility,
// gender-only-if-confident, etc. -- deferred to when the backend gains
// persistence), so this is a clearly-scoped preview: group by size then
// category (the same priority order as the project's own grouping design),
// only surfacing groups of 2+ so a lone item isn't presented as a "package".
export function computeInitialGroups(garments) {
  const byKey = new Map()
  for (const garment of garments) {
    const key = `${garment.size ?? 'unspecified size'}|${garment.category}`
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: key,
        size: garment.size ?? 'Unspecified size',
        category: garment.category,
        garmentIds: [],
      })
    }
    byKey.get(key).garmentIds.push(garment.id)
  }

  const groups = []
  const ungrouped = []
  for (const group of byKey.values()) {
    if (group.garmentIds.length > 1) groups.push(group)
    else ungrouped.push(...group.garmentIds)
  }
  return { groups, ungrouped }
}

export function removeFromGroup(groups, ungrouped, groupId, garmentId) {
  const nextGroups = groups
    .map((g) => (g.id === groupId ? { ...g, garmentIds: g.garmentIds.filter((id) => id !== garmentId) } : g))
    .filter((g) => g.garmentIds.length > 0)
  return { groups: nextGroups, ungrouped: [...ungrouped, garmentId] }
}

export function splitGroup(groups, groupId) {
  const group = groups.find((g) => g.id === groupId)
  if (!group || group.garmentIds.length < 2) return groups
  const mid = Math.ceil(group.garmentIds.length / 2)
  const first = { ...group, garmentIds: group.garmentIds.slice(0, mid) }
  const second = { ...group, id: `${group.id}-split-${Date.now()}`, garmentIds: group.garmentIds.slice(mid) }
  return groups.flatMap((g) => (g.id === groupId ? [first, second] : [g]))
}

export function mergeGroups(groups, sourceId, targetId) {
  if (sourceId === targetId) return groups
  const source = groups.find((g) => g.id === sourceId)
  if (!source) return groups
  return groups
    .map((g) => (g.id === targetId ? { ...g, garmentIds: [...g.garmentIds, ...source.garmentIds] } : g))
    .filter((g) => g.id !== sourceId)
}
