import { FolderOpen } from "lucide-react";

export default function Files() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Files</h1>
      <p className="text-gray-500 mb-8">Job files and assets linked to productions.</p>
      <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center text-center text-gray-400">
        <FolderOpen size={40} className="mb-3 opacity-30" />
        <p className="text-lg font-medium mb-1">Coming soon</p>
        <p className="text-sm">File uploads and asset management will appear here.</p>
      </div>
    </div>
  );
}
