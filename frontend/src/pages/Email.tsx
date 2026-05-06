import { Mail } from "lucide-react";

export default function Email() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Email</h1>
      <p className="text-gray-500 mb-8">Manage email threads linked to productions.</p>
      <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center text-center text-gray-400">
        <Mail size={40} className="mb-3 opacity-30" />
        <p className="text-lg font-medium mb-1">Coming soon</p>
        <p className="text-sm">Gmail integration, threaded conversations, and production linking will appear here.</p>
      </div>
    </div>
  );
}
