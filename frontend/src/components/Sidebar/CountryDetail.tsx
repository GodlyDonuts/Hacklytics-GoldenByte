"use client";

interface CountryDetailProps {
  countryCode?: string | null;
  countryName?: string | null;
}

export default function CountryDetail({ countryCode = null, countryName = null }: CountryDetailProps) {
  if (!countryCode && !countryName) {
    return (
      <div className="p-4 text-sm text-white/60">
        Select a country on the globe to see details.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <h3 className="font-semibold text-white">
        {countryName ?? countryCode}
      </h3>
      {/* Severity breakdown, funding vs need chart, flagged projects table — wire when data is available */}
      <p className="text-sm text-white/70">Detail content for selected country.</p>
    </div>
  );
}
