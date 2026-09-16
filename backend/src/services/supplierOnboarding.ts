export type SupplierOnboardingEntry = {
  email?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  postcode?: string | null;
  country?: string | null;
  supplierBillingEmail?: string | null;
  supplierBankAccountName?: string | null;
  supplierBankAccountNumber?: string | null;
  supplierBankSortCode?: string | null;
  supplierVatNumber?: string | null;
  supplierOnboardingCompletedAt?: Date | string | null;
};

function present(value?: string | null): boolean {
  return Boolean(value?.trim());
}

export function supplierOnboardingMissingFields(entry: SupplierOnboardingEntry | null | undefined): string[] {
  if (!entry) return ["supplier profile"];
  const missing: string[] = [];
  if (!present(entry.email)) missing.push("email");
  if (!present(entry.supplierBillingEmail)) missing.push("billing email");
  if (!present(entry.addressLine1)) missing.push("billing address");
  if (!present(entry.city)) missing.push("city");
  if (!present(entry.postcode)) missing.push("postcode");
  if (!present(entry.country)) missing.push("country");
  if (!present(entry.supplierBankAccountName)) missing.push("bank account name");
  if (!present(entry.supplierBankAccountNumber)) missing.push("bank account number");
  if (!present(entry.supplierBankSortCode)) missing.push("sort code");
  if (!present(entry.supplierVatNumber)) missing.push("VAT / tax number");
  return missing;
}

export function supplierOnboardingComplete(entry: SupplierOnboardingEntry | null | undefined): boolean {
  return supplierOnboardingMissingFields(entry).length === 0;
}
