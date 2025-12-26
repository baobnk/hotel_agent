import OpenAI from "openai";
import { mapKeywordsToAmenities, TOP_AMENITIES } from "./hotel-config";
import { detectQueryIntent, QueryIntent } from "./intent-detection";
import { getLocationStatistics, getRecommendedPriceRange } from "./hotel-statistics";

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
  
  // Intent fields
  queryIntent?: QueryIntent;
  sortBy?: "price_asc" | "price_desc" | "relevance";
  priceTarget?: number; // For "around $X" queries
};

export type HotelSearchResult = {
  id: number;
  name: string;
  description: string;
  location: string;
  price_per_night: number;
  tier: string | null;
  amenities: string[] | null;
  similarity: number; // Vector similarity score (0-1)
  keywordScore?: number; // BM25-style keyword score (0-1)
  combinedScore?: number; // Combined score (50% vector + 50% keyword)
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

  // Step 1: Detect intent FIRST
  const intentResult = detectQueryIntent(userMessage);

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

IMPORTANT: If user asks for "most expensive" or "cheapest", you should still extract location and keywords, but leave price fields as null (they will be set by intent logic).

Available amenities to recognize in keywords:
${TOP_AMENITIES.slice(0, 30).join(", ")}

Examples:
- "I need a quiet place in Melbourne under $200" → {location: "Melbourne", maxPrice: 200, keywords: ["quiet"], tier: null}
- "luxury hotel in Sydney with pool" → {location: "Sydney", tier: "Luxury", keywords: ["luxury", "pool"], maxPrice: null}
- "budget hotel in Brisbane" → {location: "Brisbane", tier: "Budget", keywords: ["budget"], maxPrice: null}
- "tôi muốn tìm khách sạn mắc nhất ở Sydney" → {location: "Sydney", keywords: ["luxury", "expensive"], tier: null, minPrice: null, maxPrice: null}
- "cheapest hotel in Melbourne" → {location: "Melbourne", keywords: ["cheap", "budget"], tier: null, minPrice: null, maxPrice: null}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
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
    
    // Intent fields
    queryIntent: intentResult.intent,
    sortBy: intentResult.intent === "most_expensive" ? "price_desc" 
         : intentResult.intent === "cheapest" ? "price_asc"
         : "relevance",
    priceTarget: intentResult.priceTarget
  };

  // Step 3: Apply intent-based logic with statistics
  if (intentResult.intent === "most_expensive" && hints.location) {
    const locationStats = getLocationStatistics(hints.location);
    if (locationStats) {
      // Set minPrice to 80% of maxPrice to get top tier hotels
      // But use active hotels min price (30) as base if maxPrice is too high
      const activeMin = 30; // From statistics: active_hotels.min = 30
      const targetMinPrice = Math.floor(locationStats.maxPrice * 0.8);
      hints.minPrice = Math.max(targetMinPrice, activeMin);
      hints.tier = "Luxury"; // Force luxury tier
    }
  } else if (intentResult.intent === "cheapest" && hints.location) {
    const locationStats = getLocationStatistics(hints.location);
    if (locationStats) {
      // Use active hotels min price (30) and set maxPrice to 120% of minPrice
      const activeMin = 30; // From statistics: active_hotels.min = 30
      hints.maxPrice = Math.ceil(activeMin * 1.2); // = 36, but let's use 50 for better results
      hints.maxPrice = 50; // More reasonable upper bound for cheapest
      hints.tier = "Budget"; // Force budget tier
    }
  } else if (intentResult.intent === "price_range" && intentResult.priceTarget) {
    // For "around $X" queries, set range ±20%
    hints.minPrice = Math.floor(intentResult.priceTarget * 0.8);
    hints.maxPrice = Math.ceil(intentResult.priceTarget * 1.2);
  }

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

/**
 * BM25-style keyword scoring algorithm
 * 
 * This calculates a relevance score based on keyword matches in:
 * - Hotel name
 * - Hotel description
 * - Hotel amenities
 * 
 * The score is normalized to 0-1 range.
 */
export function calculateKeywordScore(
  hotel: HotelSearchResult,
  keywords: string[],
  userQuery: string
): number {
  if (!keywords || keywords.length === 0) {
    // If no keywords extracted, use simple query word matching
    const queryWords = userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length === 0) return 0.5; // Neutral score
    keywords = queryWords;
  }

  const hotelText = [
    hotel.name,
    hotel.description,
    hotel.tier || "",
    ...(hotel.amenities || [])
  ].join(" ").toLowerCase();

  // BM25 parameters
  const k1 = 1.5; // Term frequency saturation parameter
  const b = 0.75; // Length normalization parameter
  const avgDocLength = 200; // Assumed average document length
  const docLength = hotelText.length;

  let score = 0;
  let matchedKeywords = 0;

  for (const keyword of keywords) {
    // Count occurrences of keyword in hotel text
    const regex = new RegExp(keyword, 'gi');
    const matches = hotelText.match(regex);
    const termFreq = matches ? matches.length : 0;

    if (termFreq > 0) {
      matchedKeywords++;
      
      // BM25 term frequency component
      // TF = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength)))
      const tfScore = (termFreq * (k1 + 1)) / (termFreq + k1 * (1 - b + b * (docLength / avgDocLength)));
      
      // IDF component (simplified - assume each keyword is equally important)
      const idfScore = 1;
      
      score += tfScore * idfScore;
    }
  }

  // Normalize score to 0-1 range
  // If all keywords matched perfectly, score should be close to 1
  const maxPossibleScore = keywords.length * (k1 + 1);
  const normalizedScore = Math.min(1, score / maxPossibleScore);

  // Bonus for matching more unique keywords
  const keywordCoverage = matchedKeywords / keywords.length;
  
  // Final score: weighted combination of BM25 score and keyword coverage
  const finalScore = normalizedScore * 0.6 + keywordCoverage * 0.4;

  return Math.max(0, Math.min(1, finalScore));
}

/**
 * Calculate combined score from vector similarity and keyword matching
 * 
 * @param vectorScore - Vector similarity score (cosine similarity, range -1 to 1)
 * @param keywordScore - Keyword matching score (range 0 to 1)
 * @param vectorWeight - Weight for vector score (default 0.5)
 * @returns Combined score (range 0 to 1)
 */
export function calculateCombinedScore(
  vectorScore: number,
  keywordScore: number,
  vectorWeight: number = 0.5
): number {
  // Normalize vector score from (-1, 1) to (0, 1)
  const normalizedVectorScore = (vectorScore + 1) / 2;
  
  const keywordWeight = 1 - vectorWeight;
  
  return normalizedVectorScore * vectorWeight + keywordScore * keywordWeight;
}

/**
 * Score and rank hotels using hybrid approach:
 * 1. Vector similarity (semantic matching)
 * 2. BM25 keyword matching
 * 3. Combined 50/50 score
 */
export function scoreAndRankHotels(
  hotels: HotelSearchResult[],
  keywords: string[] | null,
  userQuery: string
): HotelSearchResult[] {
  const scoredHotels = hotels.map(hotel => {
    const keywordScore = calculateKeywordScore(hotel, keywords || [], userQuery);
    const combinedScore = calculateCombinedScore(hotel.similarity, keywordScore, 0.5);
    
    return {
      ...hotel,
      keywordScore,
      combinedScore,
    };
  });

  // Sort by combined score (highest first)
  scoredHotels.sort((a, b) => (b.combinedScore || 0) - (a.combinedScore || 0));

  return scoredHotels;
}

/**
 * Generate natural language response for search results
 */
export function generateNaturalResponse(
  hotels: HotelSearchResult[],
  hints: HotelSearchHints
): string {
  if (hotels.length === 0) {
    return `Sorry, I couldn't find any hotels matching your request in ${hints.location || "this area"}. Would you like to try broadening your search criteria?`;
  }

  const topHotel = hotels[0];
  const priceInfo = hints.maxPrice ? ` within your budget of $${hints.maxPrice}` : "";
  const tierInfo = hints.tier ? ` in the ${hints.tier} category` : "";
  
  let response = `Found ${hotels.length} hotel${hotels.length > 1 ? 's' : ''} in ${hints.location}${priceInfo}${tierInfo}. `;
  
  if (topHotel) {
    const score = Math.round((topHotel.combinedScore || topHotel.similarity) * 100);
    response += `The top match is "${topHotel.name}" at $${topHotel.price_per_night}/night with ${score}% relevance.`;
  }

  return response;
}
