import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '昨日头条 · 你的私人历史日签',
  description: '翻过日历，读到历史。阅读有出处的历史往事，收藏并保存属于自己的每日历史日签。',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
