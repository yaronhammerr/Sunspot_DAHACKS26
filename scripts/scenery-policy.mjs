import { createHash } from 'node:crypto';

export const SCENERY_TAGS = ['ocean', 'bay', 'water', 'skyline', 'bridges', 'hills', 'greenery'];

/** A name, park address or distant possible sightline is not scenery evidence. */
export function sceneryFingerprint(place) {
  return createHash('sha256').update(JSON.stringify({
    id: place.id, name: place.name, lat: place.lat, lng: place.lng,
    description: place.description, sourceUrl: place.sourceUrl,
    photos: place.photos.map(photo => ({ sourceUrl: photo.sourceUrl, sha256: photo.sha256 })).sort((a,b) => a.sourceUrl.localeCompare(b.sourceUrl)),
  })).digest('hex');
}

export function applySceneryPolicy(viewpoints, manifest) {
  return viewpoints.map(place => {
    const review = manifest.viewpoints?.[place.id];
    if (!review || review.fingerprint !== sceneryFingerprint(place)) {
      throw new Error(`Scenery needs review before publication: ${place.id}`);
    }
    if (!['classified', 'unclassified'].includes(review.status)
      || !Number.isFinite(Date.parse(review.reviewedAt))
      || !Array.isArray(review.tags) || new Set(review.tags).size !== review.tags.length
      || review.tags.some(tag => !SCENERY_TAGS.includes(tag))
      || !review.note?.trim() || !review.sourceUrls?.length
      || !review.sourceUrls.every(url => /^https:\/\//.test(url))
      || (review.status === 'unclassified' && review.tags.length)
      || (review.status === 'classified' && !review.tags.length)) {
      throw new Error(`Invalid scenery review: ${place.id}`);
    }
    for (const tag of review.tags) {
      const evidence = review.evidence?.[tag];
      if (!evidence?.note?.trim() || !evidence.sourceUrls?.length
        || !evidence.sourceUrls.every(url => review.sourceUrls.includes(url))) {
        throw new Error(`Missing ${tag} evidence: ${place.id}`);
      }
    }
    return { ...place, tags: [...review.tags], sceneryReview: {
      status: review.status, reviewedAt: review.reviewedAt, note: review.note,
      evidence: review.evidence,
    } };
  });
}
