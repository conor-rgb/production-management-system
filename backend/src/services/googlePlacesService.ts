const PLACES_API = "https://places.googleapis.com/v1";

type GoogleText = {
  text?: string;
};

type GooglePrediction = {
  place?: string;
  placeId?: string;
  text?: GoogleText;
  structuredFormat?: {
    mainText?: GoogleText;
    secondaryText?: GoogleText;
  };
  types?: string[];
};

type GoogleSuggestion = {
  placePrediction?: GooglePrediction;
};

type GoogleAutocompleteResponse = {
  suggestions?: GoogleSuggestion[];
};

type GoogleAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type GooglePlaceDetails = {
  id?: string;
  displayName?: GoogleText;
  formattedAddress?: string;
  addressComponents?: GoogleAddressComponent[];
  location?: {
    latitude?: number;
    longitude?: number;
  };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  types?: string[];
};

export type PlaceSearchResult = {
  placeId: string;
  mainText: string;
  secondaryText: string;
  description: string;
  types: string[];
};

export type NormalizedPlace = {
  placeId: string;
  placeName: string | null;
  formattedAddress: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  phone: string | null;
  types: string[];
};

function apiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY is not configured");
  return key;
}

function component(components: GoogleAddressComponent[], type: string, short = false): string | null {
  const match = components.find((item) => item.types?.includes(type));
  return (short ? match?.shortText : match?.longText) ?? null;
}

function normalizePlace(place: GooglePlaceDetails): NormalizedPlace {
  const components = place.addressComponents ?? [];
  const streetNumber = component(components, "street_number");
  const route = component(components, "route");
  const premise = component(components, "premise");
  const subpremise = component(components, "subpremise");
  const city =
    component(components, "postal_town") ??
    component(components, "locality") ??
    component(components, "administrative_area_level_2");

  return {
    placeId: place.id ?? "",
    placeName: place.displayName?.text ?? null,
    formattedAddress: place.formattedAddress ?? null,
    addressLine1: [streetNumber, route].filter(Boolean).join(" ") || premise || null,
    addressLine2: subpremise,
    city,
    region: component(components, "administrative_area_level_1"),
    postcode: component(components, "postal_code"),
    country: component(components, "country", true),
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    website: place.websiteUri ?? null,
    phone: place.internationalPhoneNumber ?? place.nationalPhoneNumber ?? null,
    types: place.types ?? [],
  };
}

export async function searchPlaces(input: string, sessionToken?: string): Promise<PlaceSearchResult[]> {
  const trimmed = input.trim();
  if (trimmed.length < 3) return [];

  const response = await fetch(`${PLACES_API}/places:autocomplete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey(),
    },
    body: JSON.stringify({
      input: trimmed,
      sessionToken,
      includedRegionCodes: ["gb", "fr", "it", "es", "us"],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google Places autocomplete failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as GoogleAutocompleteResponse;
  return (data.suggestions ?? [])
    .map((suggestion) => suggestion.placePrediction)
    .filter((prediction): prediction is GooglePrediction => Boolean(prediction?.placeId))
    .map((prediction) => {
      const mainText = prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? "";
      const secondaryText = prediction.structuredFormat?.secondaryText?.text ?? "";
      return {
        placeId: prediction.placeId ?? "",
        mainText,
        secondaryText,
        description: [mainText, secondaryText].filter(Boolean).join(", "),
        types: prediction.types ?? [],
      };
    });
}

export async function getPlaceDetails(placeId: string, sessionToken?: string): Promise<NormalizedPlace> {
  const url = new URL(`${PLACES_API}/places/${encodeURIComponent(placeId)}`);
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);

  const response = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask": [
        "id",
        "displayName",
        "formattedAddress",
        "addressComponents",
        "location",
        "nationalPhoneNumber",
        "internationalPhoneNumber",
        "websiteUri",
        "types",
      ].join(","),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google Places details failed: ${response.status} ${body}`);
  }

  return normalizePlace((await response.json()) as GooglePlaceDetails);
}
