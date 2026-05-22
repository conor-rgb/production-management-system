import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Contact, Company } from "../lib/types";
import { tagColour } from "../lib/types";
import ContactModal from "../components/contacts/ContactModal";
import CompanyModal from "../components/contacts/CompanyModal";
import ContactDetail from "../components/contacts/ContactDetail";
import BlackbookOverlay from "../components/blackbook/BlackbookOverlay";
import { Search, Plus, ChevronDown, ChevronRight, Building2 } from "lucide-react";

type Tab = "CLIENT" | "SUPPLIER";

interface CompanyWithContacts extends Company {
  contacts: Contact[];
}

export default function Contacts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = (searchParams.get("tab") as Tab) ?? "CLIENT";
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<CompanyWithContacts[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [editContact, setEditContact] = useState<Contact | null | "new">(null);
  const [editCompany, setEditCompany] = useState<Company | null | "new">(null);
  const [showBlackbook, setShowBlackbook] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: tab });
      if (search) params.set("search", search);
      const [c, cos] = await Promise.all([
        api.get<Contact[]>(`/api/contacts?${params}`),
        api.get<CompanyWithContacts[]>(`/api/companies?search=${encodeURIComponent(search)}`),
      ]);
      setContacts(c);
      // Only show companies that have contacts of the right type
      const contactIds = new Set(c.map((x) => x.companyId).filter(Boolean));
      setCompanies(cos.filter((co) => contactIds.has(co.id)));
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => { load(); }, [load]);

  function setTab(t: Tab) {
    setSearchParams({ tab: t, ...(search ? { q: search } : {}) });
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Group contacts: first by company, then unaffiliated
  const contactsByCompany: Record<string, Contact[]> = {};
  const unaffiliated: Contact[] = [];
  for (const c of contacts) {
    if (c.companyId) {
      if (!contactsByCompany[c.companyId]) contactsByCompany[c.companyId] = [];
      contactsByCompany[c.companyId].push(c);
    } else {
      unaffiliated.push(c);
    }
  }

  const shownCompanies = companies.filter((co) => contactsByCompany[co.id]?.length);

  return (
    <div className="flex h-full">
      {/* List panel */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-gray-200 bg-white">
          <div className="flex gap-1">
            {(["CLIENT", "SUPPLIER"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  tab === t
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {t === "CLIENT" ? "Clients" : "Suppliers"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBlackbook(true)}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Blackbook
            </button>
            <button
              onClick={() => setEditCompany("new")}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 px-2 py-1.5 rounded-lg hover:bg-gray-100"
            >
              <Building2 size={15} /> Company
            </button>
            <button
              onClick={() => setEditContact("new")}
              className="flex items-center gap-1 text-sm bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700"
            >
              <Plus size={15} /> Contact
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-2 bg-white border-b border-gray-200">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search name, company, email, tag…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : contacts.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              No {tab === "CLIENT" ? "clients" : "suppliers"} yet.{" "}
              <button onClick={() => setEditContact("new")} className="text-indigo-600 hover:underline">
                Add one
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* Companies with their people */}
              {shownCompanies.map((co) => {
                const people = contactsByCompany[co.id] ?? [];
                const open = expanded.has(co.id);
                return (
                  <div key={co.id}>
                    <button
                      onClick={() => toggleExpanded(co.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                        <Building2 size={15} className="text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">{co.name}</p>
                        <p className="text-xs text-gray-400">{people.length} {people.length === 1 ? "person" : "people"}</p>
                      </div>
                      {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                    </button>
                    {open && (
                      <div className="ml-11">
                        {people.map((c) => (
                          <ContactRow key={c.id} contact={c} onClick={() => setSelectedContact(c)} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Unaffiliated contacts */}
              {unaffiliated.map((c) => (
                <ContactRow key={c.id} contact={c} onClick={() => setSelectedContact(c)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel (desktop) */}
      {selectedContact && (
        <div className="hidden md:flex flex-col w-96 border-l border-gray-200 bg-white overflow-auto">
          <ContactDetail
            contactId={selectedContact.id}
            onEdit={(c) => setEditContact(c)}
            onClose={() => setSelectedContact(null)}
            onRefresh={load}
          />
        </div>
      )}

      {/* Modals */}
      {editContact && (
        <ContactModal
          contact={editContact === "new" ? null : editContact}
          defaultType={tab}
          onClose={() => setEditContact(null)}
          onSaved={() => { setEditContact(null); load(); }}
        />
      )}
      {editCompany && (
        <CompanyModal
          company={editCompany === "new" ? null : editCompany}
          onClose={() => setEditCompany(null)}
          onSaved={() => { setEditCompany(null); load(); }}
        />
      )}

      {/* Mobile detail sheet */}
      {selectedContact && (
        <div className="md:hidden fixed inset-0 bg-white z-40 overflow-auto">
          <ContactDetail
            contactId={selectedContact.id}
            onEdit={(c) => setEditContact(c)}
            onClose={() => setSelectedContact(null)}
            onRefresh={load}
          />
        </div>
      )}
      {showBlackbook && <BlackbookOverlay onClose={() => setShowBlackbook(false)} />}
    </div>
  );
}

function ContactRow({ contact, onClick }: { contact: Contact; onClick: () => void }) {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0"
    >
      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 text-indigo-600 text-xs font-semibold">
        {contact.firstName[0]}{contact.lastName?.[0] ?? ""}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
        <p className="text-xs text-gray-400 truncate">{contact.email ?? contact.jobTitle ?? ""}</p>
      </div>
      <div className="flex gap-1 flex-wrap justify-end max-w-28">
        {contact.tags.slice(0, 2).map((tag) => (
          <span key={tag} className={`text-xs px-1.5 py-0.5 rounded-full ${tagColour(tag)}`}>{tag}</span>
        ))}
      </div>
    </button>
  );
}
