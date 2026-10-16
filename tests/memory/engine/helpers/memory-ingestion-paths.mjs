// Portable path matching for the synthetic crash fixture only.
export function isEpisodeManifestPath(target) {
  const normalized = String(target).replaceAll('\\', '/');
  return normalized.includes('/state/episodes/') && normalized.endsWith('/manifest.json');
}
