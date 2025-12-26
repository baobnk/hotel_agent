import OpenAI from "openai";
import { mapKeywordsToAmenities, TOP_AMENITIES } from "./hotel-config";
import { PROJECT_CONFIG, OPENAI_MODEL, EMBEDDING_MODEL } from "./project-config";

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
  sortByPrice?: "asc" | "desc" | null; // Sort by price: "asc" for cheapest, "desc" for most expensive
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
- sortByPrice: "asc" if user wants cheapest/lowest price (e.g., "rẻ nhất", "cheapest", "lowest price", "most affordable"), "desc" if user wants most expensive/highest price (e.g., "đắt nhất", "most expensive", "highest price"), otherwise null

Available amenities to recognize in keywords:
${TOP_AMENITIES.slice(0, 30).join(", ")}

Examples:
- "I need a quiet place in Melbourne under $200" → {location: "Melbourne", maxPrice: 200, keywords: ["quiet"], tier: null, sortByPrice: null}
- "luxury hotel in Sydney with pool" → {location: "Sydney", tier: "Luxury", keywords: ["luxury", "pool"], maxPrice: null, sortByPrice: null}
- "luxury hotel rẻ nhất ở Sydney" → {location: "Sydney", tier: "Luxury", keywords: ["luxury"], sortByPrice: "asc"}
- "cheapest budget hotel in Brisbane" → {location: "Brisbane", tier: "Budget", keywords: ["budget"], sortByPrice: "asc"}
- "most expensive luxury hotel" → {tier: "Luxury", keywords: ["luxury"], sortByPrice: "desc"}
`;

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: PROJECT_CONFIG.openai.temperature.parsing,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
    max_tokens: PROJECT_CONFIG.openai.maxTokens.parsing,
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

  // Detect sortByPrice from query
  let sortByPrice: "asc" | "desc" | null = null;
  const queryLower = userMessage.toLowerCase();
  
  // Check for cheapest/lowest price indicators
  const cheapestKeywords = ["rẻ nhất", "cheapest", "lowest price", "most affordable", "giá rẻ nhất", "rẻ nhấ", "cheap nhất"];
  const expensiveKeywords = ["đắt nhất", "most expensive", "highest price", "giá cao nhất", "đắt nhấ", "expensive nhất"];
  
  if (cheapestKeywords.some(kw => queryLower.includes(kw))) {
    sortByPrice = "asc";
  } else if (expensiveKeywords.some(kw => queryLower.includes(kw))) {
    sortByPrice = "desc";
  }
  
  // Also check parsed.sortByPrice from OpenAI if available
  if (!sortByPrice && typeof parsed.sortByPrice === "string") {
    if (parsed.sortByPrice.toLowerCase() === "asc") sortByPrice = "asc";
    else if (parsed.sortByPrice.toLowerCase() === "desc") sortByPrice = "desc";
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
    sortByPrice,
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
    model: EMBEDDING_MODEL,
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
 * LLM Re-ranking: Use GPT-4.1-mini to re-order results based on user intent
 * 
 * This allows flexible re-ranking based on complex user requirements like:
 * - "cheapest hotel" → sort by price ascending
 * - "most expensive luxury" → sort by price descending
 * - "best value" → balance of price and quality
 * - "closest to beach" → semantic ranking
 */
export async function llmReRankHotels(
  hotels: HotelSearchResult[],
  userQuery: string,
  hints: HotelSearchHints
): Promise<HotelSearchResult[]> {
  if (hotels.length <= 1) {
    return hotels;
  }

  // If sortByPrice is detected, do simple sort (no need for LLM)
  if (hints.sortByPrice === "asc") {
    return [...hotels].sort((a, b) => a.price_per_night - b.price_per_night);
  }
  if (hints.sortByPrice === "desc") {
    return [...hotels].sort((a, b) => b.price_per_night - a.price_per_night);
  }

  // Default: Sort by combined score (highest match first)
  // Only use LLM re-ranking for special cases like "best value" or complex intent
  const queryLower = userQuery.toLowerCase();
  const needsLLMReranking = 
    queryLower.includes("best value") || 
    queryLower.includes("best deal") ||
    queryLower.includes("most suitable") ||
    (hints.keywords && hints.keywords.some(k => ["value", "deal", "suitable"].includes(k.toLowerCase())));

  // If no special intent, sort STRICTLY by combined score (highest first)
  // Price is only used as tie-breaker when scores are EXACTLY equal
  if (!needsLLMReranking) {
    return [...hotels].sort((a, b) => {
      const scoreA = a.combinedScore || a.similarity || 0;
      const scoreB = b.combinedScore || b.similarity || 0;
      
      // Primary: combined score (descending) - ALWAYS prioritize higher score
      if (scoreA !== scoreB) {
        return scoreB - scoreA; // Higher score first
      }
      
      // Secondary: only if scores are EXACTLY equal, prefer lower price
      return a.price_per_night - b.price_per_night;
    });
  }

  // Only use LLM for complex re-ranking cases
  if (!process.env.OPENAI_API_KEY) {
    // Fallback to score-based sorting
    return [...hotels].sort((a, b) => {
      const scoreA = a.combinedScore || a.similarity || 0;
      const scoreB = b.combinedScore || b.similarity || 0;
      return scoreB - scoreA;
    });
  }

  // For complex queries, use LLM to understand and rank
  const hotelsForLLM = hotels.map((h, idx) => ({
    idx,
    name: h.name,
    price: h.price_per_night,
    tier: h.tier,
    similarity: Math.round(h.similarity * 100),
    combinedScore: Math.round((h.combinedScore || 0) * 100),
  }));

  const systemPrompt = `You are a hotel ranking assistant. Given a user's query and a list of hotels, return the hotel indices in the optimal order based on the user's intent.

User Query: "${userQuery}"

Hotels:
${hotelsForLLM.map(h => `[${h.idx}] ${h.name} - $${h.price}/night - ${h.tier || 'N/A'} tier - ${h.combinedScore}% match`).join('\n')}

IMPORTANT: Always prioritize hotels with HIGHEST match score first, unless user explicitly wants something else (like "cheapest" or "best value").

Ranking rules:
- If user wants "cheapest" or "lowest price" → prioritize lowest price
- If user wants "most expensive" or "best" → prioritize highest price/quality
- If user wants "best value" → balance price and match score (value = match score / price)
- Otherwise → prioritize by match score (HIGHEST FIRST)

Return ONLY a JSON array of indices in optimal order, like [2, 0, 1, 3].
No explanation, just the JSON array.`;

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: PROJECT_CONFIG.openai.temperature.reranking,
      max_tokens: PROJECT_CONFIG.openai.maxTokens.reranking,
      messages: [
        { role: "system", content: systemPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return hotels;

    // Parse response - expect { "order": [0, 1, 2, ...] } or just [0, 1, 2, ...]
    const parsed = JSON.parse(content);
    const order = Array.isArray(parsed) ? parsed : (parsed.order || parsed.indices || parsed.ranking);
    
    if (!Array.isArray(order)) return hotels;

    // Reorder hotels based on LLM response
    const reordered: HotelSearchResult[] = [];
    for (const idx of order) {
      if (typeof idx === 'number' && idx >= 0 && idx < hotels.length) {
        reordered.push(hotels[idx]);
      }
    }

    // Add any missing hotels at the end
    for (const hotel of hotels) {
      if (!reordered.includes(hotel)) {
        reordered.push(hotel);
      }
    }

    return reordered;
  } catch (error) {
    console.error("LLM re-ranking error:", error);
    return hotels;
  }
}

/**
 * Generate natural language response for search results using LLM (non-streaming)
 * Tone: Professional, warm, and helpful hotel booking consultant
 */
export async function generateNaturalResponse(
  hotels: HotelSearchResult[],
  hints: HotelSearchHints
): Promise<string> {
  if (hotels.length === 0) {
    return `I apologize, but I couldn't find any hotels matching your preferences in ${hints.location || "that area"}. Would you like me to search with different criteria, such as a broader price range or different amenities?`;
  }

  if (!process.env.OPENAI_API_KEY) {
    return getFallbackResponse(hotels, hints);
  }

  const { systemPrompt, userPrompt } = buildNaturalResponsePrompts(hotels, hints);

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: PROJECT_CONFIG.openai.temperature.naturalResponse,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: PROJECT_CONFIG.openai.maxTokens.naturalResponse,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    return content.trim();
  } catch (error) {
    console.error("Error generating natural response:", error);
    return getFallbackResponse(hotels, hints);
  }
}

/**
 * Generate natural language response using streaming (word by word)
 * Yields chunks of text as they come from OpenAI
 */
export async function* generateNaturalResponseStreaming(
  hotels: HotelSearchResult[],
  hints: HotelSearchHints
): AsyncGenerator<string> {
  if (hotels.length === 0) {
    yield `I apologize, but I couldn't find any hotels matching your preferences in ${hints.location || "that area"}. Would you like me to search with different criteria, such as a broader price range or different amenities?`;
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    yield getFallbackResponse(hotels, hints);
    return;
  }

  const { systemPrompt, userPrompt } = buildNaturalResponsePrompts(hotels, hints);

  try {
    const stream = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: PROJECT_CONFIG.openai.temperature.naturalResponse,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: PROJECT_CONFIG.openai.maxTokens.naturalResponse,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  } catch (error) {
    console.error("Error generating streaming response:", error);
    yield getFallbackResponse(hotels, hints);
  }
}

/**
 * Build prompts for natural language response
 */
function buildNaturalResponsePrompts(
  hotels: HotelSearchResult[],
  hints: HotelSearchHints
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are an expert Hotel Booking Consultant. Your goal is to help users find the perfect stay based on their needs, preferences, and budget.

Keep your response CONCISE and focused:
- Provide 1-2 top recommendations with brief highlights (key features, vibe, why it matches)
- Mention 1-2 other options briefly with their unique selling points
- Keep descriptions short (1-2 sentences per hotel)
- Skip lengthy comparisons unless critical
- No booking tips unless specifically asked

Tone: Professional, warm, and helpful. Be brief but descriptive.`;

  // Format hotels data for LLM
  const hotelsData = hotels.map((hotel, index) => {
    const matchScore = Math.round((hotel.combinedScore || hotel.similarity) * 100);
    return {
      rank: index + 1,
      name: hotel.name,
      location: hotel.location,
      price: hotel.price_per_night,
      tier: hotel.tier || "Not specified",
      description: hotel.description,
      amenities: hotel.amenities || [],
      matchScore: `${matchScore}%`,
    };
  });

  const userPrompt = `I need your help recommending hotels based on the following search results:

User's Search Criteria:
- Location: ${hints.location || "Not specified"}
- Price Range: ${hints.maxPrice ? `Up to $${hints.maxPrice}/night` : hints.minPrice ? `From $${hints.minPrice}/night` : "Any price"}
- Tier Preference: ${hints.tier || "Any"}
- Keywords: ${hints.keywords?.join(", ") || "None"}
- Amenities: ${hints.amenities?.join(", ") || "None"}

Available Hotels (${hotels.length} options, sorted by match score):
${hotelsData.map(h => `
${h.rank}. ${h.name}
   - Location: ${h.location}
   - Price: $${h.price}/night
   - Tier: ${h.tier}
   - Match Score: ${h.matchScore}
   - Description: ${h.description}
   - Amenities: ${h.amenities.join(", ") || "None"}
`).join("\n")}

Please provide a CONCISE, natural response (max 150 words). Include:
1. Brief greeting
2. Top recommendation (1-2 sentences: name, price, key feature, why it matches)
3. 1-2 other options (1 sentence each: name, price, unique point)
4. Brief closing

Keep it warm, professional, and SHORT. Focus on what matters most.`;

  return { systemPrompt, userPrompt };
}

/**
 * Fallback response when OpenAI is unavailable
 */
function getFallbackResponse(hotels: HotelSearchResult[], hints: HotelSearchHints): string {
  const topHotel = hotels[0];
  return `I've found ${hotels.length} excellent option${hotels.length > 1 ? 's' : ''} for you in ${hints.location}. My top recommendation is **${topHotel.name}**, priced at $${topHotel.price_per_night} per night${topHotel.tier ? ` (${topHotel.tier} tier)` : ""}. ${hotels.length > 1 ? `I also have ${hotels.length - 1} other option${hotels.length === 2 ? '' : 's'} below that you might like to consider.` : ""} Would you like more details about any of these properties, or shall I help you refine your search?`;
}
