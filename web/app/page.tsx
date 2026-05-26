import dynamic from 'next/dynamic';

const MapView = dynamic(
  () => import(/* webpackChunkName: "mapview" */ '@/components/MapView'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50 text-slate-600">
        지도 로드 중…
      </div>
    ),
  },
);

export default function HomePage() {
  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <MapView />
    </main>
  );
}
