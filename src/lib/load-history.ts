import 'server-only';
import bundled from '@/data/catalog.json';
import { parseCatalog, type CatalogResult } from './history';

const REMOTE = 'https://raw.githubusercontent.com/EveLee-Teuk/yesterdays-headlines-data/main/catalog.json';
export async function loadHistory(): Promise<CatalogResult> {
  try {
    const response = await fetch(REMOTE, { next: { revalidate: 900 }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`History HTTP ${response.status}`);
    return { catalog: parseCatalog(await response.json()), origin: 'remote' };
  } catch {
    // A legacy array or invalid remote payload must never be treated as verified history.
    return { catalog: parseCatalog(bundled), origin: 'bundled' };
  }
}
