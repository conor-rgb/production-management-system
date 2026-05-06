import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Contact } from "../../lib/types";
import { tagColour, STAGE_LABELS } from "../../lib/types";
import { X, Mail, Phone, Edit2, Building2, Briefcase, Clock, TrendingUp } from "lucide-react";

interface Props {
  contactId: string;
  onEdit: (c: Contact) => void;
  onClose: () => void;
  onRefresh: () => void;
}

interface FullContact extends Contact {
  opportunities: { id: string; title: string; stage: string; value?: string; brand?: string; createdAt: string }[];
  crewMembers: { id: string; production: { id: string; title: string; jobCode?: string; status: string } }[];
}

export default function ContactDetail({ contactId, onEdit, onClose }: Props) {
  const [contact, setContact] = useState<FullContact | null>(null);

  useEffect(() => {
    api.get<FullContact>(`/api/contacts/${contactId}`).then(setContact).catch(console.error);
  }, [contactId]);

  if (!contact) return (
    <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
  );

  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold text-lg">
            {contact.firstName[0]}{contact.lastName?.[0] ?? ""}
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">{name}</h2>
            {contact.jobTitle && <p className="text-sm text-gray-500">{contact.jobTitle}</p>}
            <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${contact.type === "CLIENT" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
              {contact.type}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(contact)} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <Edit2 size={16} />
          </button>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-5">
        {/* Contact info */}
        <div className="space-y-2">
          {contact.company && (
            <InfoRow icon={<Building2 size={15} />} label={contact.company.name} />
          )}
          {contact.email && (
            <InfoRow icon={<Mail size={15} />} label={contact.email} href={`mailto:${contact.email}`} />
          )}
          {contact.phone && (
            <InfoRow icon={<Phone size={15} />} label={contact.phone} href={`tel:${contact.phone}`} />
          )}
          {contact.source && (
            <InfoRow icon={<Briefcase size={15} />} label={`Source: ${contact.source.replace(/_/g, " ")}`} />
          )}
          {contact.lastContactedAt && (
            <InfoRow
              icon={<Clock size={15} />}
              label={`Last contact: ${new Date(contact.lastContactedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
            />
          )}
        </div>

        {/* Tags */}
        {contact.tags.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Tags</p>
            <div className="flex flex-wrap gap-1">
              {contact.tags.map((tag) => (
                <span key={tag} className={`text-xs px-2 py-1 rounded-full ${tagColour(tag)}`}>{tag}</span>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {contact.notes && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{contact.notes}</p>
          </div>
        )}

        {/* Opportunities timeline */}
        {contact.opportunities.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Opportunities</p>
            <div className="space-y-2">
              {contact.opportunities.map((opp) => (
                <div key={opp.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <TrendingUp size={14} className="text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{opp.title}</p>
                    {opp.brand && <p className="text-xs text-gray-500">{opp.brand}</p>}
                  </div>
                  <span className="text-xs text-gray-500">{STAGE_LABELS[opp.stage as keyof typeof STAGE_LABELS] ?? opp.stage}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Productions (crew) */}
        {contact.crewMembers.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Productions</p>
            <div className="space-y-2">
              {contact.crewMembers.map((cm) => (
                <div key={cm.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{cm.production.title}</p>
                    {cm.production.jobCode && <p className="text-xs text-gray-500">{cm.production.jobCode}</p>}
                  </div>
                  <span className="text-xs text-gray-500">{cm.production.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ icon, label, href }: { icon: React.ReactNode; label: string; href?: string }) {
  const cls = "flex items-center gap-2 text-sm text-gray-700";
  if (href) return (
    <a href={href} className={`${cls} hover:text-indigo-600`}>
      <span className="text-gray-400">{icon}</span> {label}
    </a>
  );
  return (
    <div className={cls}>
      <span className="text-gray-400">{icon}</span> {label}
    </div>
  );
}
