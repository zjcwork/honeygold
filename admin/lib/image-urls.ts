// Uploaded images belong to this service. Keep their URLs independent of proxy origins.
export function uploadedImagePath(value: string): string {
  const match = value.match(/^(?:https?:\/\/[^/?#]+)?(\/api\/images\/[a-f0-9-]{36})$/i);
  return match ? match[1] : value;
}
const imageFields = new Set(['image', 'url', 'cover_image', 'hero_image', 'contact_qr', 'detail_images']);
export function normalizeImageUrls(value: any): any {
  if (Array.isArray(value)) return value.map(normalizeImageUrls);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    imageFields.has(key) && typeof item === 'string'
      ? item.split('\n').map(uploadedImagePath).join('\n')
      : normalizeImageUrls(item),
  ]));
}
