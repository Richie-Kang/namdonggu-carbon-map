import type { Metadata } from 'next';
import './globals.css';
import 'maplibre-gl/dist/maplibre-gl.css';

export const metadata: Metadata = {
  title: '남동구 탄소지도 | Namdong-gu Carbon Map',
  description: '인천 남동구 건물·지번 단위 탄소배출 시뮬레이터',
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
