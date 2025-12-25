/**
 * Hotel Search Configuration
 * Tier definitions, amenities mapping, and validation rules
 */

// Tier definitions với phạm vi giá cụ thể
export const TIER_DEFINITIONS = {
  Budget: {
    minPrice: 0,
    maxPrice: 150,
    description: "Budget-friendly hotels, typically under $150/night",
    typicalRange: "$0 - $150",
  },
  "Mid-tier": {
    minPrice: 150,
    maxPrice: 400,
    description: "Mid-range hotels, typically $150-$400/night",
    typicalRange: "$150 - $400",
  },
  Luxury: {
    minPrice: 300,
    maxPrice: Infinity,
    description: "Luxury hotels, typically $300+/night",
    typicalRange: "$300+",
  },
} as const;

// Top 30 amenities phổ biến nhất (từ statistics)
export const TOP_AMENITIES = [
  "None",
  "Bar",
  "Pool",
  "View",
  "River",
  "Garden",
  "Club",
  "Train",
  "Sand",
  "Ferry",
  "Beer",
  "Shop",
  "WiFi",
  "Desk",
  "Gym",
  "Kitchen",
  "Balcony",
  "Nature",
  "Casino",
  "Beach",
  "History",
  "Vegan",
  "Surf",
  "Cafe",
  "Market",
  "Walk",
  "Climb",
  "Cinema",
  "Tea",
  "Yoga",
] as const;

// Amenities mapping - map từ user query keywords sang amenities trong database
export const AMENITY_MAPPING: Record<string, string[]> = {
  // Quiet/Peaceful related
  quiet: ["Quiet", "Silence", "Nature", "Library", "No TV"],
  peaceful: ["Quiet", "Silence", "Nature", "Garden"],
  silent: ["Quiet", "Silence", "No TV"],
  tranquil: ["Quiet", "Nature", "Garden"],
  serene: ["Quiet", "Nature", "Garden"],

  // Family related
  family: ["Pool", "Kids Club", "Kitchen", "Beach", "Games Room"],
  "family-friendly": ["Pool", "Kids Club", "Kitchen", "Beach"],
  kids: ["Pool", "Kids Club", "Beach", "Games Room"],
  children: ["Pool", "Kids Club", "Beach"],

  // Business related
  business: ["WiFi", "Desk", "Meeting", "Gym", "Co-working"],
  corporate: ["WiFi", "Desk", "Meeting", "Gym"],
  meeting: ["Meeting", "Ballroom", "Desk"],
  conference: ["Meeting", "Ballroom", "Desk"],

  // Luxury related
  luxury: ["Spa", "Butler", "View", "Pool", "Casino", "Concierge"],
  spa: ["Spa", "Pool"],
  butler: ["Butler", "Chauffeur"],
  exclusive: ["Private", "Butler", "View"],

  // Nature/Outdoor
  nature: ["Nature", "Garden", "Forest", "Hiking"],
  garden: ["Garden", "Nature"],
  beach: ["Beach", "Sand", "Pool"],
  pool: ["Pool", "Beach"],
  river: ["River", "View", "Walk"],

  // Transportation
  train: ["Train", "Central"],
  ferry: ["Ferry"],
  airport: ["Shuttle", "Plane"],
  transport: ["Train", "Ferry", "Shuttle"],

  // Food & Drink
  restaurant: ["Dining", "Food"],
  bar: ["Bar", "Club", "Beer"],
  cafe: ["Cafe", "Coffee"],
  breakfast: ["Cafe", "Coffee", "Tea"],
  vegan: ["Vegan"],

  // Entertainment
  casino: ["Casino", "Gambling"],
  nightlife: ["Club", "Bar", "Nightlife"],
  party: ["Club", "Bar", "Beer"],

  // Practical
  wifi: ["WiFi", "Ethernet"],
  internet: ["WiFi", "Ethernet"],
  gym: ["Gym"],
  parking: ["Parking"],
  kitchen: ["Kitchen"],

  // Unique experiences
  view: ["View", "Balcony", "River"],
  balcony: ["Balcony", "View"],
  library: ["Library", "Books"],
  fireplace: ["Fireplace", "Books"],
} as const;

/**
 * Map user keywords to database amenities
 */
export function mapKeywordsToAmenities(keywords: string[]): string[] {
  const mappedAmenities = new Set<string>();

  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase();
    const amenities = AMENITY_MAPPING[lowerKeyword];
    if (amenities) {
      amenities.forEach((amenity) => mappedAmenities.add(amenity));
    }
  }

  return Array.from(mappedAmenities);
}

/**
 * Get tier from price
 */
export function getTierFromPrice(price: number): keyof typeof TIER_DEFINITIONS | null {
  if (price < TIER_DEFINITIONS.Budget.maxPrice) {
    return "Budget";
  }
  if (price < TIER_DEFINITIONS["Mid-tier"].maxPrice) {
    return "Mid-tier";
  }
  if (price >= TIER_DEFINITIONS.Luxury.minPrice) {
    return "Luxury";
  }
  return null;
}

/**
 * Validate tier matches price range
 */
export function validateTierPrice(
  tier: string | null,
  price: number
): { valid: boolean; reason?: string } {
  if (!tier) return { valid: true };

  const tierDef = TIER_DEFINITIONS[tier as keyof typeof TIER_DEFINITIONS];
  if (!tierDef) {
    return { valid: true }; // Unknown tier, skip validation
  }

  if (price < tierDef.minPrice || price > tierDef.maxPrice) {
    return {
      valid: false,
      reason: `${tier} tier typically ranges ${tierDef.typicalRange}, but hotel price is $${price}`,
    };
  }

  return { valid: true };
}

/**
 * Validate hotel result before returning
 */
export function validateHotelResult(hotel: {
  id: number;
  name: string;
  location: string;
  price_per_night: number;
  tier: string | null;
  amenities: string[] | null;
  similarity?: number;
}): { valid: boolean; reason?: string } {
  // Check 1: Price must be positive
  if (hotel.price_per_night < 0) {
    return { valid: false, reason: "Price cannot be negative" };
  }

  // Check 2: Price must be reasonable (not 0 unless explicitly allowed)
  if (hotel.price_per_night === 0) {
    return { valid: false, reason: "Price cannot be zero" };
  }

  // Check 3: Tier must match price range
  const tierValidation = validateTierPrice(hotel.tier, hotel.price_per_night);
  if (!tierValidation.valid) {
    return tierValidation;
  }

  // Check 4: Location must be valid
  const validLocations = ["Melbourne", "Sydney", "Brisbane"];
  if (!validLocations.includes(hotel.location)) {
    return { valid: false, reason: `Invalid location: ${hotel.location}` };
  }

  // Check 5: Similarity should be reasonable (if provided)
  if (hotel.similarity !== undefined) {
    // Similarity from cosine distance: range -1 to 1, typically -0.5 to 0.9
    if (hotel.similarity < -1 || hotel.similarity > 1) {
      return { valid: false, reason: `Invalid similarity score: ${hotel.similarity}` };
    }
  }

  // Check 6: Name must exist
  if (!hotel.name || hotel.name.trim().length === 0) {
    return { valid: false, reason: "Hotel name is required" };
  }

  return { valid: true };
}

