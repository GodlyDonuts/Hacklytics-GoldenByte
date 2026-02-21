'use client';

import dynamic from 'next/dynamic';

const GlobeView = dynamic(() => import('@/components/Globe/GlobeView'), { ssr: false });

export default function Home() {
  return (
    <div className="relative min-h-screen w-full">
      <GlobeView />
    </div>
  );
}
