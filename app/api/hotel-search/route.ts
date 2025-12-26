import { NextRequest } from "next/server";
import { supabaseRpcWithRetry } from "@/lib/supabase";
import {
  HotelSearchHints,
  HotelSearchResult,
  buildEmbeddingFromQuery,
  parseHotelQueryWithOpenAI,
  calculateKeywordScore,
  calculateCombinedScore,
  generateNaturalResponse,
} from "@/lib/hotel-query";
import { validateHotelResult } from "@/lib/hotel-config";

type RequestBody = {
  message: string;
  stream?: boolean;
};

// Helper to create streaming response
function createStreamResponse(generator: AsyncGenerator<string>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for await (const chunk of generator) {
        controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * Summary Context - Filter irrelevant info based on query
 */
interface SummaryContext {
  queryIntent: string;
  relevantFilters: string[];
  irrelevantFiltersRemoved: string[];
  relevantHotels: HotelSearchResult[];
  filteredOutHotels: { id: number; name: string; reason: string }[];
  contextSummary: string;
}

function buildSummaryContext(
  query: string,
  hints: HotelSearchHints,
  hotels: HotelSearchResult[]
): SummaryContext {
  const queryLower = query.toLowerCase();
  
  // Determine query intent based on keywords
  const intents: string[] = [];
  if (queryLower.includes("quiet") || queryLower.includes("peaceful") || queryLower.includes("silent")) {
    intents.push("quiet_peaceful");
  }
  if (queryLower.includes("party") || queryLower.includes("nightlife") || queryLower.includes("club")) {
    intents.push("party_nightlife");
  }
  if (queryLower.includes("family") || queryLower.includes("kid") || queryLower.includes("children")) {
    intents.push("family_friendly");
  }
  if (queryLower.includes("business") || queryLower.includes("work") || queryLower.includes("meeting")) {
    intents.push("business");
  }
  if (queryLower.includes("luxury") || queryLower.includes("premium") || queryLower.includes("expensive")) {
    intents.push("luxury");
  }
  if (queryLower.includes("cheap") || queryLower.includes("budget") || queryLower.includes("affordable")) {
    intents.push("budget");
  }
  if (queryLower.includes("beach") || queryLower.includes("surf") || queryLower.includes("ocean")) {
    intents.push("beach");
  }
  if (queryLower.includes("romantic") || queryLower.includes("honeymoon") || queryLower.includes("couple")) {
    intents.push("romantic");
  }
  
  const queryIntent = intents.length > 0 ? intents.join(" + ") : "general_search";
  
  // Determine which filters are relevant
  const relevantFilters: string[] = [];
  const irrelevantFiltersRemoved: string[] = [];
  
  if (hints.location) relevantFilters.push(`Location: ${hints.location}`);
  if (hints.maxPrice) relevantFilters.push(`Max price: $${hints.maxPrice}`);
  if (hints.minPrice) relevantFilters.push(`Min price: $${hints.minPrice}`);
  if (hints.tier) relevantFilters.push(`Tier: ${hints.tier}`);
  if (hints.keywords?.length) relevantFilters.push(`Keywords: ${hints.keywords.join(", ")}`);
  if (hints.amenities?.length) relevantFilters.push(`Amenities: ${hints.amenities.join(", ")}`);
  
  // Filter hotels based on query intent (remove contradicting hotels)
  const relevantHotels: HotelSearchResult[] = [];
  const filteredOutHotels: { id: number; name: string; reason: string }[] = [];
  
  for (const hotel of hotels) {
    const hotelDesc = hotel.description.toLowerCase();
    const hotelName = hotel.name.toLowerCase();
    let isRelevant = true;
    let filterReason = "";
    
    // If looking for quiet, filter out party/noisy hotels
    if (intents.includes("quiet_peaceful")) {
      if (hotelDesc.includes("party") || hotelDesc.includes("nightlife") || 
          hotelDesc.includes("loud") || hotelDesc.includes("noisy") ||
          hotelDesc.includes("nightclub") || hotelDesc.includes("dj")) {
        isRelevant = false;
        filterReason = "Hotel is party/noisy, but query wants quiet/peaceful";
      }
    }
    
    // If looking for party, filter out quiet/silent hotels
    if (intents.includes("party_nightlife")) {
      if (hotelDesc.includes("quiet") || hotelDesc.includes("silent") || 
          hotelDesc.includes("peaceful") || hotelDesc.includes("retreat")) {
        isRelevant = false;
        filterReason = "Hotel is quiet/peaceful, but query wants party/nightlife";
      }
    }
    
    // If looking for family, filter out adult-only or party hotels
    if (intents.includes("family_friendly")) {
      if (hotelDesc.includes("nightclub") || hotelDesc.includes("casino") ||
          hotelDesc.includes("adults only") || hotelName.includes("party")) {
        isRelevant = false;
        filterReason = "Hotel not suitable for families";
      }
    }
    
    // If looking for luxury, filter out hostels/backpacker places
    if (intents.includes("luxury")) {
      if (hotelDesc.includes("hostel") || hotelDesc.includes("backpacker") ||
          hotelDesc.includes("bunk") || hotel.tier === "Budget") {
        isRelevant = false;
        filterReason = "Hotel is budget/hostel, but query wants luxury";
      }
    }
    
    // If looking for budget, filter out very expensive hotels
    if (intents.includes("budget")) {
      if (hotel.tier === "Luxury" || hotel.price_per_night > 300) {
        isRelevant = false;
        filterReason = "Hotel is luxury/expensive, but query wants budget";
      }
    }
    
    if (isRelevant) {
      relevantHotels.push(hotel);
    } else {
      filteredOutHotels.push({
        id: hotel.id,
        name: hotel.name,
        reason: filterReason
      });
    }
  }
  
  // If all hotels were filtered out, keep original list
  const finalRelevantHotels = relevantHotels.length > 0 ? relevantHotels : hotels;
  
  // Build context summary
  const contextSummary = `Query intent: ${queryIntent}. ` +
    `Applied filters: ${relevantFilters.join(", ")}. ` +
    `Found ${finalRelevantHotels.length} relevant hotels` +
    (filteredOutHotels.length > 0 ? `, filtered out ${filteredOutHotels.length} contradicting results.` : ".");
  
  return {
    queryIntent,
    relevantFilters,
    irrelevantFiltersRemoved,
    relevantHotels: finalRelevantHotels,
    filteredOutHotels,
    contextSummary
  };
}

/**
 * Build SQL query description for transparency
 */
function buildSqlQueryDescription(hints: HotelSearchHints): string {
  const conditions: string[] = [
    "is_active = true",
    `location = '${hints.location}'`,
  ];
  
  if (hints.minPrice) conditions.push(`price_per_night >= ${hints.minPrice}`);
  if (hints.maxPrice) conditions.push(`price_per_night <= ${hints.maxPrice}`);
  if (hints.tier) conditions.push(`tier = '${hints.tier}'`);
  if (hints.amenities?.length) conditions.push(`amenities && ARRAY[${hints.amenities.map(a => `'${a}'`).join(', ')}]`);
  
  return `SELECT id, name, description, location, price_per_night, tier, amenities,
       1 - (description_embedding <-> query_embedding) AS similarity
FROM hotels
WHERE ${conditions.join('\n  AND ')}
ORDER BY description_embedding <-> query_embedding
LIMIT 15`;
}

// Streaming generator for hotel search
async function* streamHotelSearch(userMessage: string): AsyncGenerator<string> {
  // Step 1: Parsing query
  yield JSON.stringify({ step: "parsing", message: "🔍 Step 1: Analyzing your request..." });

  const hints: HotelSearchHints = await parseHotelQueryWithOpenAI(userMessage);

  // Send extracted info
  yield JSON.stringify({
    step: "parsing_complete",
    message: "🔍 Query analyzed",
    details: {
      location: hints.location || "Not specified",
      priceRange: hints.maxPrice ? `≤ $${hints.maxPrice}` : hints.minPrice ? `≥ $${hints.minPrice}` : "Any",
      tier: hints.tier || "Any",
      keywords: hints.keywords || [],
      amenities: hints.amenities || []
    }
  });

  // Check for clarification needed
  if (!hints.location) {
    yield JSON.stringify({
      type: "clarification",
      message: "I can help you find a hotel, but first tell me which city you want: Melbourne, Sydney, or Brisbane?",
      missingFields: ["location"],
      partialHints: hints,
    });
    return;
  }

  // Step 2: Generate embedding
  yield JSON.stringify({ step: "embedding", message: "🧠 Step 2: Creating semantic embedding..." });

  const embedding = await buildEmbeddingFromQuery(userMessage);

  yield JSON.stringify({
    step: "embedding_complete",
    message: "🧠 Embedding created (1536 dimensions)",
    details: {
      model: "text-embedding-3-small",
      dimensions: 1536
    }
  });

  // Step 3: Hybrid Search (SQL + Vector + BM25)
  yield JSON.stringify({ 
    step: "hybrid_search", 
    message: `📍 Step 3: Hybrid Search in ${hints.location}...`
  });

  // Step 3.1: SQL Query
  const sqlQuery = buildSqlQueryDescription(hints);
  yield JSON.stringify({
    step: "sql_query",
    message: "📋 Step 3.1: SQL Query with filters",
    details: {
      query: sqlQuery,
      filters: {
        location: hints.location,
        minPrice: hints.minPrice,
        maxPrice: hints.maxPrice,
        tier: hints.tier,
        amenities: hints.amenities
      }
    }
  });

  const { data, error } = await supabaseRpcWithRetry("match_hotels_hybrid", {
    query_embedding: embedding,
    p_location: hints.location,
    p_min_price: hints.minPrice ?? null,
    p_max_price: hints.maxPrice ?? null,
    p_tier: hints.tier ?? null,
    p_amenities: hints.amenities && hints.amenities.length > 0 ? hints.amenities : null,
    p_limit: 15,
  });

  if (error) {
    console.error("Supabase RPC error:", error);
    yield JSON.stringify({ 
      type: "error", 
      message: "Search failed due to connection issues. Please try again in a moment." 
    });
    return;
  }

  // Map hotels from database
  const rawData = (data as any[]) || [];
  let hotels: HotelSearchResult[] = rawData.map((row: any) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    location: row.location,
    price_per_night: row.price_per_night,
    tier: row.tier,
    amenities: row.amenities,
    similarity: row.similarity,
  }));

  // Apply intent-based sorting BEFORE vector/BM25 scoring (if needed)
  // For most_expensive and cheapest, we want price-based sorting
  // For normal queries, we'll use relevance (vector + BM25) later
  if (hints.sortBy === "price_desc") {
    // Sort by price DESC for most expensive
    hotels.sort((a, b) => b.price_per_night - a.price_per_night);
  } else if (hints.sortBy === "price_asc") {
    // Sort by price ASC for cheapest
    hotels.sort((a, b) => a.price_per_night - b.price_per_night);
  }
  // else: keep original order (will be sorted by relevance later)

  // Step 3.2: SQL Filter Results
  yield JSON.stringify({
    step: "sql_results",
    message: `📋 Step 3.1 Result: Found ${hotels.length} hotels after SQL filters`,
    details: {
      count: hotels.length,
      hotels: hotels.map(h => ({
        id: h.id,
        name: h.name,
        price: h.price_per_night,
        tier: h.tier
      }))
    }
  });

  // Step 3.3: Vector Search Results (already sorted by similarity from DB)
  const vectorResults = [...hotels].sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
  
  yield JSON.stringify({
    step: "vector_results",
    message: "🔍 Step 3.2: Vector Search Results (sorted by cosine similarity)",
    details: {
      method: "Cosine similarity on description_embedding",
      results: vectorResults.slice(0, 10).map((h, i) => ({
        rank: i + 1,
        id: h.id,
        name: h.name,
        vectorScore: Math.round(((h.similarity + 1) / 2) * 100) + "%"
      }))
    }
  });

  // Step 3.4: BM25 Keyword Search Results
  const hotelsWithKeywordScore = hotels.map(hotel => ({
    ...hotel,
    keywordScore: calculateKeywordScore(hotel, hints.keywords || [], userMessage)
  }));
  
  const bm25Results = [...hotelsWithKeywordScore].sort((a, b) => (b.keywordScore || 0) - (a.keywordScore || 0));
  
  yield JSON.stringify({
    step: "bm25_results",
    message: "🔤 Step 3.3: BM25 Keyword Search Results",
    details: {
      method: "BM25-style term frequency matching",
      keywords: hints.keywords || [],
      results: bm25Results.slice(0, 10).map((h, i) => ({
        rank: i + 1,
        id: h.id,
        name: h.name,
        keywordScore: Math.round((h.keywordScore || 0) * 100) + "%"
      }))
    }
  });

  // Step 3.5: Combined Ranking (50% Vector + 50% BM25)
  const combinedResults = hotelsWithKeywordScore.map(hotel => ({
    ...hotel,
    combinedScore: calculateCombinedScore(hotel.similarity, hotel.keywordScore || 0, 0.5)
  }));
  
  // Apply final sorting based on intent
  if (hints.sortBy === "price_desc") {
    // For most_expensive: sort by price DESC (ignore relevance score)
    combinedResults.sort((a, b) => b.price_per_night - a.price_per_night);
  } else if (hints.sortBy === "price_asc") {
    // For cheapest: sort by price ASC (ignore relevance score)
    combinedResults.sort((a, b) => a.price_per_night - b.price_per_night);
  } else {
    // For normal queries: sort by combinedScore (relevance)
    combinedResults.sort((a, b) => (b.combinedScore || 0) - (a.combinedScore || 0));
  }

  yield JSON.stringify({
    step: "combined_ranking",
    message: "⚖️ Step 3.4: Combined Ranking (50% Vector + 50% BM25)",
    details: {
      formula: "combinedScore = vectorScore × 0.5 + keywordScore × 0.5",
      results: combinedResults.slice(0, 10).map((h, i) => ({
        rank: i + 1,
        id: h.id,
        name: h.name,
        vectorScore: Math.round(((h.similarity + 1) / 2) * 100) + "%",
        keywordScore: Math.round((h.keywordScore || 0) * 100) + "%",
        combinedScore: Math.round((h.combinedScore || 0) * 100) + "%"
      }))
    }
  });

  // Step 4: Validate data integrity
  yield JSON.stringify({ step: "validating", message: "✅ Step 4: Validating data integrity..." });

  const validatedHotels: HotelSearchResult[] = [];
  for (const hotel of combinedResults) {
    const validation = validateHotelResult(hotel);
    if (validation.valid) {
      validatedHotels.push(hotel);
    } else {
      console.warn(`Invalid hotel filtered out: ${hotel.name} (ID: ${hotel.id}) - ${validation.reason}`);
    }
  }

  yield JSON.stringify({
    step: "validation_complete",
    message: `✅ Validated: ${validatedHotels.length}/${combinedResults.length} hotels passed`,
    details: {
      passed: validatedHotels.length,
      failed: combinedResults.length - validatedHotels.length
    }
  });

  // Limit results to 3-5 hotels
  const minResults = 3;
  const maxResults = 5;
  const candidateHotels = validatedHotels.slice(0, Math.min(maxResults, Math.max(minResults, validatedHotels.length)));

  // Step 5: Summary Context - Filter irrelevant info based on query
  yield JSON.stringify({ step: "summary_context", message: "📝 Step 5: Summarizing context & filtering irrelevant info..." });

  // Build summary context - filter only relevant information for the query
  const summaryContext = buildSummaryContext(userMessage, hints, candidateHotels);
  
  yield JSON.stringify({
    step: "summary_context_complete",
    message: "📝 Context summarized",
    details: summaryContext
  });

  // Final hotels after context filtering
  const finalHotels = summaryContext.relevantHotels;

  // Step 6: Send results
  yield JSON.stringify({ 
    step: "found", 
    message: `✨ Step 6: Found ${finalHotels.length} best matching hotel${finalHotels.length > 1 ? 's' : ''}!` 
  });

  // Send hotels one by one for streaming effect
  for (let i = 0; i < finalHotels.length; i++) {
    const hotel = finalHotels[i];
    yield JSON.stringify({
      type: "hotel",
      index: i,
      hotel,
      matchScore: Math.round((hotel.combinedScore || 0) * 100),
      matchReason: generateMatchReason(hotel, hints),
    });
  }

  // Final summary
  const naturalResponse = generateNaturalResponse(finalHotels, hints);
  
  yield JSON.stringify({
    type: "results",
    message: naturalResponse,
    hints,
    hotels: finalHotels,
    summaryContext,
    matchReasons: finalHotels.map(h => ({
      hotelId: h.id,
      matchScore: Math.round((h.combinedScore || 0) * 100),
      matchReason: generateMatchReason(h, hints),
    })),
  });
}

/**
 * Generate a match reason based on hotel attributes and search hints
 */
function generateMatchReason(hotel: HotelSearchResult, hints: HotelSearchHints): string {
  const reasons: string[] = [];
  
  // Location match
  reasons.push(`Located in ${hotel.location}`);
  
  // Price match
  if (hints.maxPrice && hotel.price_per_night <= hints.maxPrice) {
    reasons.push(`within budget ($${hotel.price_per_night}/night)`);
  } else {
    reasons.push(`$${hotel.price_per_night}/night`);
  }
  
  // Tier match
  if (hints.tier && hotel.tier === hints.tier) {
    reasons.push(`${hotel.tier} tier as requested`);
  } else if (hotel.tier) {
    reasons.push(`${hotel.tier} tier`);
  }
  
  // Amenities match
  if (hints.amenities && hints.amenities.length > 0 && hotel.amenities) {
    const matchedAmenities = hints.amenities.filter(a => 
      hotel.amenities?.some(ha => ha.toLowerCase().includes(a.toLowerCase()))
    );
    if (matchedAmenities.length > 0) {
      reasons.push(`has ${matchedAmenities.join(", ")}`);
    }
  }
  
  // Score info
  const vectorScore = Math.round(((hotel.similarity + 1) / 2) * 100);
  const keywordScore = Math.round((hotel.keywordScore || 0) * 100);
  reasons.push(`(Vector: ${vectorScore}%, BM25: ${keywordScore}%)`);
  
  return reasons.join(", ");
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;
    const userMessage = (body.message || "").trim();
    const useStream = body.stream !== false; // Default to streaming

    if (!userMessage) {
      const response = {
        type: "clarification",
        message: "Please tell me what kind of hotel you need so I can search for you.",
        missingFields: ["location"],
        partialHints: {},
      };
      
      if (useStream) {
        return createStreamResponse((async function* () {
          yield JSON.stringify(response);
        })());
      }
      return Response.json(response, { status: 400 });
    }

    // Use streaming response
    if (useStream) {
      return createStreamResponse(streamHotelSearch(userMessage));
    }

    // Non-streaming fallback
    const hints: HotelSearchHints = await parseHotelQueryWithOpenAI(userMessage);

    if (!hints.location) {
      return Response.json({
        type: "clarification",
        message: "I can help you find a hotel, but first tell me which city you want: Melbourne, Sydney, or Brisbane?",
        missingFields: ["location"],
        partialHints: hints,
      });
    }

    const embedding = await buildEmbeddingFromQuery(userMessage);

    const { data, error } = await supabaseRpcWithRetry("match_hotels_hybrid", {
      query_embedding: embedding,
      p_location: hints.location,
      p_min_price: hints.minPrice ?? null,
      p_max_price: hints.maxPrice ?? null,
      p_tier: hints.tier ?? null,
      p_amenities: hints.amenities && hints.amenities.length > 0 ? hints.amenities : null,
      p_limit: 15,
    });

    if (error) {
      console.error("Supabase RPC error:", error);
      return Response.json({ error: "Search failed due to connection issues" }, { status: 503 });
    }

    // Map hotels
    const rawData = (data as any[]) || [];
    let hotels: HotelSearchResult[] = rawData.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      location: row.location,
      price_per_night: row.price_per_night,
      tier: row.tier,
      amenities: row.amenities,
      similarity: row.similarity,
    }));

    // Calculate keyword scores
    const hotelsWithScores = hotels.map(hotel => ({
      ...hotel,
      keywordScore: calculateKeywordScore(hotel, hints.keywords || [], userMessage),
      combinedScore: 0
    }));

    // Calculate combined scores and sort
    const rankedHotels = hotelsWithScores.map(hotel => ({
      ...hotel,
      combinedScore: calculateCombinedScore(hotel.similarity, hotel.keywordScore, 0.5)
    })).sort((a, b) => (b.combinedScore || 0) - (a.combinedScore || 0));

    // Validate hotels
    const validatedHotels: HotelSearchResult[] = [];
    for (const hotel of rankedHotels) {
      const validation = validateHotelResult(hotel);
      if (validation.valid) {
        validatedHotels.push(hotel);
      }
    }

    // Limit results
    const minResults = 3;
    const maxResults = 5;
    const finalHotels = validatedHotels.slice(0, Math.min(maxResults, Math.max(minResults, validatedHotels.length)));

    return Response.json({
      type: "results",
      message: generateNaturalResponse(finalHotels, hints),
      hints,
      hotels: finalHotels,
      matchReasons: finalHotels.map(h => ({
        hotelId: h.id,
        matchScore: Math.round((h.combinedScore || 0) * 100),
        matchReason: generateMatchReason(h, hints),
      })),
    });
  } catch (err) {
    console.error("Hotel search API error:", err);
    return Response.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
