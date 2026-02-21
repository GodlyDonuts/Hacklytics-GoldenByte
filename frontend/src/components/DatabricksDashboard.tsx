"use client";

/**
 * Embeds a Databricks AI/BI dashboard in an iframe.
 *
 * Requires NEXT_PUBLIC_DATABRICKS_DASHBOARD_URL to be set in .env.
 * See docs/DASHBOARD_SETUP.md for instructions on creating and
 * publishing the dashboard in Databricks.
 */

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DATABRICKS_DASHBOARD_URL;

interface DatabricksDashboardProps {
  className?: string;
  height?: string;
}

export default function DatabricksDashboard({
  className = "",
  height = "800px",
}: DatabricksDashboardProps) {
  if (!DASHBOARD_URL) {
    return (
      <div
        className={`flex items-center justify-center border border-dashed border-gray-600 rounded-lg p-8 ${className}`}
        style={{ height }}
      >
        <div className="text-center text-gray-400">
          <p className="text-lg font-medium mb-2">
            Databricks Dashboard Not Configured
          </p>
          <p className="text-sm">
            Set <code className="bg-gray-800 px-1 rounded">NEXT_PUBLIC_DATABRICKS_DASHBOARD_URL</code> in your{" "}
            <code className="bg-gray-800 px-1 rounded">.env</code> file.
          </p>
          <p className="text-sm mt-1">
            See <code className="bg-gray-800 px-1 rounded">docs/DASHBOARD_SETUP.md</code> for setup instructions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      src={DASHBOARD_URL}
      className={`w-full border-0 rounded-lg ${className}`}
      style={{ height }}
      title="Crisis Topography Dashboard"
      sandbox="allow-scripts allow-same-origin allow-popups"
    />
  );
}
