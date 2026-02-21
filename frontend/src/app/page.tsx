import React from 'react';
import LandingContent from '@/components/landing/LandingContent';

export const metadata = {
  title: 'Crisis Topography Command Center — See Where Aid Fails to Reach',
  description:
    'Interactive 3D globe revealing humanitarian funding mismatches. Powered by ML anomaly detection, Databricks vector search, and ElevenLabs voice AI.',
};

export default function LandingPage() {
  return <LandingContent />;
}