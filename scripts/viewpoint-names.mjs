/** Source-backed display names are applied after discovery deduplication. */
export function applyViewpointNames(viewpoints, manifest) {
  return viewpoints.map(place => {
    const name = manifest.viewpoints?.[place.id];
    if (!name) return place;
    if (!name.name?.trim() || /unnamed|osm-node-|osm-way-/i.test(name.name)
      || !['official', 'nearby-feature', 'photo-context'].includes(name.kind)
      || !name.note?.trim() || !name.sourceUrls?.length
      || !name.sourceUrls.every(url => /^https:\/\//.test(url))
      || !Number.isFinite(Date.parse(manifest.reviewedAt))) {
      throw new Error(`Invalid researched name for ${place.id}`);
    }
    // A later OSM import may establish an actual name. Prefer that new source
    // name over an older descriptive alias until the alias is reviewed again.
    if (place.name !== name.originalName && name.kind !== 'official') return place;
    return { ...place, name: name.name, nameContext: {
      kind: name.kind, note: name.note, sourceUrls: name.sourceUrls,
      reviewedAt: manifest.reviewedAt,
    } };
  });
}
