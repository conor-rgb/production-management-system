export interface AicpSection {
  code: string;
  name: string;
  items: string[];
}

export const AICP_SECTIONS: AicpSection[] = [
  { code: "A", name: "Pre-Production & Wrap Labor", items: ["Producer", "Production Manager", "Production Coordinator", "Production Assistant", "Casting Director", "Location Scout", "Pre-production days", "Wrap days", "Travel days"] },
  { code: "B", name: "Shooting Crew Labor", items: ["Director of Photography", "Camera Operator", "1st AC", "2nd AC", "Digital Tech", "Gaffer", "Best Boy Electric", "Key Grip", "Best Boy Grip", "Swing", "Spark", "Sound Recordist", "Art Director", "Stylist", "Hair & Makeup Artist", "Wardrobe Stylist", "Set Designer", "Props Stylist", "Runner", "BTS Photographer", "BTS Videographer", "Drone Operator", "Steadicam Operator"] },
  { code: "C", name: "Pre-Production Expenses", items: ["Casting fees", "Location scout fees", "Production office costs", "Working meals pre-pro", "Messengers and couriers", "Photocopying and printing"] },
  { code: "D", name: "Location & Travel", items: ["Location fee", "Location permit", "Location insurance", "Catering shoot days", "Craft service", "Unit base", "Parking", "Taxis and Ubers", "Flights", "Hotel", "Car hire", "Trucking", "Mileage"] },
  { code: "E", name: "Makeup Wardrobe & Animals", items: ["Costume purchase", "Costume hire", "Makeup kit rental", "Hair kit rental", "Wardrobe van", "Animal talent", "Animal handler"] },
  { code: "F", name: "Studio & Stage", items: ["Studio rental", "Power and electricity", "Studio security", "Dressing rooms", "Cyclorama rental", "Studio parking"] },
  { code: "G", name: "Art Department Labor", items: ["Production Designer", "Art Director", "Set Decorator", "Props Buyer", "Prop Maker", "Scenic Painter", "Set Builder"] },
  { code: "H", name: "Art Department Expenses", items: ["Props purchase", "Props hire", "Set dressing purchase", "Set dressing hire", "Set construction materials", "Art department trucking", "Art department meals"] },
  { code: "I", name: "Equipment", items: ["Camera body package", "Lens package", "Digital capture and tethering", "Monitors", "Lighting package", "Grip package", "Generator", "Sound kit", "Camera van", "Steadicam package", "Drone package", "Data wrangling kit", "Playback system", "Equipment insurance", "Equipment delivery"] },
  { code: "J", name: "Film & Digital Media", items: ["Hard drives", "Memory cards", "Data backup", "Transcoding", "Cloud storage", "Digital delivery"] },
  { code: "K", name: "Miscellaneous", items: ["Shipping", "Messengers", "Petty cash", "Special insurance", "Contingency", "Bank charges"] },
  { code: "L", name: "Director & Creative Fees", items: ["Director fee", "Photographer fee still life", "Photographer fee model day", "Photographer overtime", "Test shoot day", "Hold and cancellation fee", "Treatment and pre-production fee"] },
  { code: "M", name: "Talent Labor", items: ["Principal talent", "Supporting talent", "Featured extra", "Background extra", "Model half day", "Model full day", "Child talent", "Spokesperson"] },
  { code: "N", name: "Talent Expenses", items: ["Talent agency commission", "Talent travel", "Talent accommodation", "Talent wardrobe allowance", "Usage rights stills", "Usage rights motion"] },
  { code: "O", name: "Post Production Labor", items: ["Post Producer", "Editor", "Colourist", "Retoucher", "Motion Graphics Artist", "Sound Designer", "Music Supervisor"] },
  { code: "P", name: "Editorial & Finishing", items: ["Edit suite rental", "Colour grade", "Sound mix", "Music license", "Stock footage", "Visual effects", "Final delivery and mastering", "Social media versions", "Versioning"] },
];

export function sectionName(code: string): string {
  return AICP_SECTIONS.find((section) => section.code === code)?.name ?? code;
}
