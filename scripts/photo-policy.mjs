/** Publication policy: a decoded, reviewed local image is required for every spot. */
export const PHOTO_POLICY = { minLongEdge: 1600, minShortEdge: 900, minPanoramaWidth: 1920, minPanoramaHeight: 400, maxPixels: 16000000, maxBytes: 12000000 };
export function hasPhotoResolution(width, height) {
  return Number.isFinite(width) && Number.isFinite(height) &&
    ((Math.max(width,height) >= 1600 && Math.min(width,height) >= 900) || (width >= 1920 && height >= 400 && width / height >= 3));
}
export function imageDimensions(bytes) {
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  if(bytes[0]===255 && bytes[1]===216) {
    for(let offset=2;offset+8<bytes.length;) {
      if(bytes[offset]!==255)break;
      const marker=bytes[offset+1];
      if(marker===255){offset++;continue;}
      if(marker===217||marker===218)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return {height:bytes.readUInt16BE(offset+5),width:bytes.readUInt16BE(offset+7)};
      const length=bytes.readUInt16BE(offset+2);if(length<2)break;offset+=2+length;
    }
  }
  if(bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP') {
    const type=bytes.toString('ascii',12,16);
    if(type==='VP8X')return {width:bytes.readUIntLE(24,3)+1,height:bytes.readUIntLE(27,3)+1};
    if(type==='VP8L' && bytes[20]===47) { const bits=bytes.readUInt32LE(21);return {width:(bits&16383)+1,height:((bits>>>14)&16383)+1}; }
    if(type==='VP8 ' && bytes[23]===157 && bytes[24]===1 && bytes[25]===42)return {width:bytes.readUInt16LE(26)&16383,height:bytes.readUInt16LE(28)&16383};
  }
  throw new Error('Photo is not a supported, readable JPEG, PNG or WebP image.');
}
export function isPublishablePhoto(photo) {
  return !!photo && /^\/viewpoints\/photos\/[a-f0-9]{20}\.(jpg|png|webp)$/.test(photo.url ?? '')
    && hasPhotoResolution(photo.width, photo.height) && hasPhotoResolution(photo.sourceWidth, photo.sourceHeight)
    && photo.width <= photo.sourceWidth && photo.height <= photo.sourceHeight
    && ((photo.width / photo.height >= 3 || photo.height > photo.width) ? photo.displayFit === 'contain' : true)
    && photo.width * photo.height <= PHOTO_POLICY.maxPixels && photo.bytes <= PHOTO_POLICY.maxBytes
    && photo.verification?.status === 'verified' && !!photo.verification.subjectNote?.trim()
    && Number.isFinite(Date.parse(photo.verification.checkedAt))
    && /^[a-f0-9]{64}$/.test(photo.sha256 ?? '') && photo.bytes > 0
    && !!photo.author?.trim() && !!photo.license?.trim()
    && /^https:\/\//.test(photo.sourceUrl ?? '') && /^https:\/\//.test(photo.originalUrl ?? '')
    && /CC BY|CC0|Public domain/i.test(photo.license) && !/\bNC\b|\bND\b/i.test(photo.license);
}
export function applyPhotoPolicy(inventory, manifest) {
  const published = [], excluded = [];
  for (const place of inventory) {
    const photos = (manifest.viewpoints?.[place.id]?.photos ?? []).filter(isPublishablePhoto);
    if (photos.length) published.push({ ...place, photos });
    else excluded.push({ id: place.id, name: place.name, county: place.county, region: place.region, reason: 'No verified high-resolution preview photo', excludedAt: manifest.checkedAt });
  }
  return { viewpoints: published, excluded };
}
