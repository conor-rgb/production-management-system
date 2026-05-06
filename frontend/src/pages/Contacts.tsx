import { Users } from "lucide-react";

export default function Contacts() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Contacts</h1>
      <p className="text-gray-500 mb-8">Clients, crew, and suppliers in one place.</p>
      <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center text-center text-gray-400">
        <Users size={40} className="mb-3 opacity-30" />
        <p className="text-lg font-medium mb-1">Coming soon</p>
        <p className="text-sm">Contact list with company associations and communication history will appear here.</p>
      </div>
    </div>
  );
}
