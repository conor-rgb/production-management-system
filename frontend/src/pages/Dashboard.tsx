import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Stats {
  opportunityCount: number;
  productionCount: number;
  contactCount: number;
  companyCount: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api.get<Stats>("/api/dashboard").then(setStats).catch(console.error);
  }, []);

  const cards = [
    { label: "Opportunities", value: stats?.opportunityCount },
    { label: "Productions", value: stats?.productionCount },
    { label: "Contacts", value: stats?.contactCount },
    { label: "Companies", value: stats?.companyCount },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">{c.label}</p>
            <p className="text-3xl font-semibold text-gray-900 mt-1">
              {c.value ?? "—"}
            </p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400">
        <p className="text-lg font-medium mb-1">More widgets coming soon</p>
        <p className="text-sm">Recent activity, upcoming shoots, and budget summaries will appear here.</p>
      </div>
    </div>
  );
}
