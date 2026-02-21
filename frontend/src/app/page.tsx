// // "use client";

// // import dynamic from "next/dynamic";

// // const GlobeView = dynamic(() => import("@/components/Globe/GlobeView"), {
// //   ssr: false,
// // });

// // export default function Home() {
// //   return (
// //     <div className="relative min-h-screen w-full">
// //       <GlobeView />
// //     </div>
// //   );
// // }
// 'use client';

// import React, { useMemo } from 'react';
// import Globe from 'react-globe.gl';

// export default function GlobeScene() {
//   // Memoize data to prevent unnecessary re-renders
//   const arcsData = useMemo(() => [...Array(20).keys()].map(() => ({
//     startLat: (Math.random() - 0.5) * 180,
//     startLng: (Math.random() - 0.5) * 360,
//     endLat: (Math.random() - 0.5) * 180,
//     endLng: (Math.random() - 0.5) * 360,
//     color: ['red', 'white', 'blue', 'green'][Math.round(Math.random() * 3)]
//   })), []);

//   return (
//     <div className="globe-container">
//       <Globe
//         globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
//         backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
//         arcsData={arcsData}
//         arcColor={'color'}
//         arcDashLength={0.4}
//         arcDashGap={4}
//         arcDashAnimateTime={2000}
//       />
//     </div>
//   );
// }
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