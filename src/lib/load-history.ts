import 'server-only';
import bundled from '@/data/catalog.json';
import { beijingToday, loadReviewedHistory, type CatalogResult } from './history';

const ROOT = 'https://raw.githubusercontent.com/EveLee-Teuk/yesterdays-headlines-data/main/';
async function readRemote(path: string) {
  const response = await fetch(ROOT + path, { next: { revalidate: 60 }, signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error(`History HTTP ${response.status}`);
  return response.json();
}
export async function loadHistory(): Promise<CatalogResult> {
  return loadReviewedHistory(readRemote, bundled, beijingToday(), (path, reason) => {
    console.warn('[history] Remote data unavailable', { path, reason });
  });
}
