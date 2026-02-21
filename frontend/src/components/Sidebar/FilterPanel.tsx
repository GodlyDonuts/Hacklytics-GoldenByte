"use client";

export default function FilterPanel() {
  return (
    <div className="space-y-4 p-4">
      <h3 className="text-sm font-semibold text-white/90">Filters</h3>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" className="rounded" />
          Year
        </label>
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" className="rounded" />
          Crisis type
        </label>
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" className="rounded" />
          Cluster
        </label>
      </div>
      {/* Wire to globe state (year, cluster, mismatch type) when store/context is connected */}
    </div>
  );
}
