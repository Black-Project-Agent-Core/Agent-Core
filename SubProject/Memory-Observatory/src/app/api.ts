import type { ObservatoryHealth } from './types';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: 'GET', cache: 'no-store' });
  if (!response.ok) throw new Error(`OBSERVATORY_HTTP_${response.status}`);
  return response.json() as Promise<T>;
}

export const observatoryApi = {
  health: () => getJson<ObservatoryHealth>('/api/health'),
};
