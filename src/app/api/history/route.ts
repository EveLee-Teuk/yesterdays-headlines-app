import { loadHistory } from '@/lib/load-history';
export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json(await loadHistory(), { headers: { 'Cache-Control': 'no-store' } });
}
