import { HistoryReader } from '@/components/HistoryReader';
import { loadHistory } from '@/lib/load-history';
import { beijingToday } from '@/lib/history';
export const dynamic = 'force-dynamic';
export default async function Home() {
  return <HistoryReader initial={await loadHistory()} initialDate={beijingToday()} />;
}
