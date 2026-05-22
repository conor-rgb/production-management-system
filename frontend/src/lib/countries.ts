export const COUNTRY_OPTIONS = [
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "FR", name: "France" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "DE", name: "Germany" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "IE", name: "Ireland" },
  { code: "PT", name: "Portugal" },
  { code: "DK", name: "Denmark" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "CH", name: "Switzerland" },
  { code: "AT", name: "Austria" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "AU", name: "Australia" },
  { code: "CA", name: "Canada" },
  { code: "JP", name: "Japan" },
] as const;

export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  return COUNTRY_OPTIONS.find((country) => country.code === code)?.name ?? code;
}
