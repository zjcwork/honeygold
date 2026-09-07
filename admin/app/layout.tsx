import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '蜜金 · 活动预约管理',
  description: 'HONEY GOLD CLUB 活动预约与运营管理平台',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
