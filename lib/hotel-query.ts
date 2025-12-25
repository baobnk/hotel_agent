import OpenAI from "openai";
import { mapKeywordsToAmenities, TOP_AMENITIES } from "./hotel-config";

export type HotelSearchHints = {
  location?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  keywords?: string[] | null;
  // New fields
  name?: string | null;
  tier?: "Budget" | "Mid-tier" | "Luxury" | null;
  amenities?: string[] | null; // Mapped amenities from keywords
  price?: number | null; // Exact price if specified
};

export type HotelSearchResult = {
  id: number;
  name: string;
  description: string;
  location: string;
  price_per_night: number;
  tier: string | null;
  amenities: string[] | null;
  similarity: number;
};

export type HotelSearchResponse =
  | {
      type: "clarification";
      message: string;
      missingFields: ("location")[];
      partialHints: HotelSearchHints;
    }
  | {
      type: "results";
      message: string;
      hints: HotelSearchHints;
      hotels: HotelSearchResult[];
    };

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function parseHotelQueryWithOpenAI(
  userMessage: string
): Promise<HotelSearchHints> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const systemPrompt = `
You are a parser that extracts hotel search parameters from natural language.
Always respond with pure JSON only, no extra text.

Fields to extract:
- location: city name (Melbourne, Sydney, or Brisbane) if specified, otherwise null
- minPrice: integer minimum price per night in AUD if specified (e.g., "under $200" → 0, "above $100" → 100), otherwise null
- maxPrice: integer maximum price per night in AUD if specified (e.g., "under $200" → 200, "below $300" → 300), otherwise null
- price: exact price if user specifies a specific price (e.g., "$200 hotel" → 200), otherwise null
- tier: tier name if specified ("Budget", "Mid-tier", or "Luxury"). Infer from keywords like "cheap", "budget", "luxury", "mid-range", otherwise null
- name: hotel name if user mentions a specific hotel name, otherwise null
- keywords: array of lowercased descriptive keywords inferred from the request (e.g. ["quiet", "family", "business", "pool", "spa", "beach"])

Available amenities to recognize in keywords:
${TOP_AMENITIES.slice(0, 30).join(", ")}

Examples:
- "I need a quiet place in Melbourne under $200" → {location: "Melbourne", maxPrice: 200, keywords: ["quiet"], tier: null}
- "luxury hotel in Sydney with pool" → {location: "Sydney", tier: "Luxury", keywords: ["luxury", "pool"], maxPrice: null}
- "budget hotel in Brisbane" → {location: "Brisbane", tier: "Budget", keywords: ["budget"], maxPrice: null}
- "family hotel with pool and kids club" → {keywords: ["family", "pool", "kids"], tier: null}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI response was empty");
  }

  const parsed = JSON.parse(content);

  // Extract keywords
  const keywords: string[] = Array.isArray(parsed.keywords)
    ? parsed.keywords.map((k: unknown) => String(k).toLowerCase())
    : [];

  // Map keywords to amenities
  const mappedAmenities = mapKeywordsToAmenities(keywords);

  // Extract tier
  let tier: "Budget" | "Mid-tier" | "Luxury" | null = null;
  if (typeof parsed.tier === "string") {
    const tierLower = parsed.tier.toLowerCase();
    if (tierLower === "budget") tier = "Budget";
    else if (tierLower === "mid-tier" || tierLower === "mid tier" || tierLower === "midrange") tier = "Mid-tier";
    else if (tierLower === "luxury") tier = "Luxury";
  }

  // If tier not explicitly set, try to infer from keywords
  if (!tier && keywords.length > 0) {
    const keywordStr = keywords.join(" ");
    if (keywordStr.includes("budget") || keywordStr.includes("cheap") || keywordStr.includes("affordable")) {
      tier = "Budget";
    } else if (keywordStr.includes("luxury") || keywordStr.includes("premium") || keywordStr.includes("exclusive")) {
      tier = "Luxury";
    } else if (keywordStr.includes("mid") || keywordStr.includes("moderate")) {
      tier = "Mid-tier";
    }
  }

  const hints: HotelSearchHints = {
    location:
      typeof parsed.location === "string" && parsed.location
        ? parsed.location
        : null,
    minPrice:
      typeof parsed.minPrice === "number" && !Number.isNaN(parsed.minPrice) && parsed.minPrice >= 0
        ? parsed.minPrice
        : null,
    maxPrice:
      typeof parsed.maxPrice === "number" && !Number.isNaN(parsed.maxPrice) && parsed.maxPrice > 0
        ? parsed.maxPrice
        : null,
    price:
      typeof parsed.price === "number" && !Number.isNaN(parsed.price) && parsed.price > 0
        ? parsed.price
        : null,
    tier,
    name:
      typeof parsed.name === "string" && parsed.name.trim()
        ? parsed.name.trim()
        : null,
    keywords: keywords.length > 0 ? keywords : null,
    amenities: mappedAmenities.length > 0 ? mappedAmenities : null,
  };

  return hints;
}

export async function buildEmbeddingFromQuery(
  query: string
): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    throw new Error("Failed to generate embedding");
  }

  return embedding;
}

// LLM Validation Result type
export type LLMValidationResult = {
  validHotels: Array<{
    hotel: HotelSearchResult;
    matchScore: number; // 0-100
    matchReason: string;
  }>;
  invalidHotels: Array<{
    hotel: HotelSearchResult;
    reason: string;
  }>;
  naturalResponse: string;
};

/**
 * Use LLM to validate search results against user query
 * - Filter out hotels that don't truly match the query
 * - Generate natural language response
 */
export async function validateAndFormatResultsWithLLM(
  userQuery: string,
  hints: HotelSearchHints,
  hotels: HotelSearchResult[]
): Promise<LLMValidationResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  // If no hotels, return early
  if (hotels.length === 0) {
    return {
      validHotels: [],
      invalidHotels: [],
      naturalResponse: `Sorry, I couldn't find any hotels matching your request in ${hints.location || "this area"}. Would you like to try broadening your search criteria?`,
    };
  }

  const systemPrompt = `You are a professional hotel concierge assistant. Your tasks:

1. EVALUATE each hotel based ONLY on the user's EXPLICIT requirements
2. SCORE each hotel from 0-100 based on how well it matches
3. RANK hotels by score (highest first) - DO NOT filter any out
4. CREATE a natural, friendly response presenting the results

CRITICAL EVALUATION RULES:
- Evaluate ONLY against what the user EXPLICITLY asked for
- "family-friendly" does NOT mean the hotel must have "Kids Club" - just that families can stay there
- "quiet" means peaceful/tranquil - check the description
- "pool" means the hotel should have a pool
- "near beach" means close to beach
- DO NOT invent requirements the user didn't state
- In matchReason: describe what the hotel HAS that matches, not what it's missing
- Only mention missing features if they were EXPLICITLY requested (pool, beach, specific amenities)

SCORING GUIDE:
- 90-100: Matches ALL explicit requirements
- 70-89: Matches most requirements, minor gaps
- 50-69: Matches some requirements
- 0-49: Matches few requirements

LANGUAGE: Default English. Match user's language if different.

Return JSON:
{
  "validHotels": [
    {
      "hotelId": number,
      "matchScore": number (0-100),
      "matchReason": "What this hotel offers that matches the request"
    }
  ],
  "naturalResponse": "Present hotels naturally. Focus on what they offer, not what they lack."
}`;

  const hotelsInfo = hotels.map((h, i) => ({
    index: i + 1,
    id: h.id,
    name: h.name,
    description: h.description,
    location: h.location,
    price: h.price_per_night,
    tier: h.tier,
    amenities: h.amenities,
    similarityScore: h.similarity,
  }));

  const userPrompt = `USER QUERY (detect language from this):
"${userQuery}"

EXTRACTED SEARCH PARAMETERS (ONLY evaluate based on these):
- Location: ${hints.location || "Any location"}
- Tier: ${hints.tier || "Any tier"}
- Min Price: ${hints.minPrice ? `$${hints.minPrice}` : "No minimum"}
- Max Price: ${hints.maxPrice ? `$${hints.maxPrice}` : "No maximum"}
- Keywords: ${hints.keywords?.join(", ") || "None - do not assume any keywords"}
- Required Amenities: ${hints.amenities?.join(", ") || "None - do not require any specific amenities"}

IMPORTANT: If a parameter is "None" or "Any", do NOT use it to filter or penalize hotels.

SEARCH RESULTS (${hotels.length} hotels):
${JSON.stringify(hotelsInfo, null, 2)}

Evaluate each hotel ONLY against the specified parameters. Present results naturally.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("LLM validation response was empty");
    }

    const parsed = JSON.parse(content);

    // Map ALL hotels back with their scores (no filtering)
    const validHotels: LLMValidationResult["validHotels"] = [];
    const scoredHotelIds = new Set<number>();

    // Process hotels that LLM scored
    if (Array.isArray(parsed.validHotels)) {
      for (const v of parsed.validHotels) {
        const hotel = hotels.find((h) => h.id === v.hotelId);
        if (hotel) {
          validHotels.push({
            hotel,
            matchScore: v.matchScore,
            matchReason: v.matchReason || "",
          });
          scoredHotelIds.add(hotel.id);
        }
      }
    }

    // Add any hotels that LLM didn't score (with default score based on similarity)
    for (const hotel of hotels) {
      if (!scoredHotelIds.has(hotel.id)) {
        validHotels.push({
          hotel,
          matchScore: Math.round(((hotel.similarity + 1) / 2) * 100),
          matchReason: "Matched by semantic search",
        });
      }
    }

    // Sort ALL hotels by matchScore descending (higher scores first)
    validHotels.sort((a, b) => b.matchScore - a.matchScore);

    return {
      validHotels,
      invalidHotels: [], // No filtering, all hotels included
      naturalResponse: parsed.naturalResponse || `Found ${validHotels.length} hotels sorted by relevance.`,
    };
  } catch (error) {
    console.error("LLM validation error:", error);
    // Fallback: return all hotels as valid with default response
    return {
      validHotels: hotels.map((hotel) => ({
        hotel,
        matchScore: Math.round(((hotel.similarity + 1) / 2) * 100),
        matchReason: "Matched by semantic search",
      })),
      invalidHotels: [],
      naturalResponse: `Found ${hotels.length} hotels in ${hints.location}. The top match is "${hotels[0]?.name}" at $${hotels[0]?.price_per_night}/night.`,
    };
  }
}


