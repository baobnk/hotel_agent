import { NextRequest } from "next/server";
import OpenAI from "openai";
import { supabaseRpcWithRetry } from "@/lib/supabase";
import {
  HotelSearchHints,
  HotelSearchResult,
  buildEmbeddingFromQuery,
  parseHotelQueryWithOpenAI,
  calculateKeywordScore,
  calculateCombinedScore,
  generateNaturalResponse,
  generateNaturalResponseStreaming,
  llmReRankHotels,
} from "@/lib/hotel-query";
import { validateHotelResult } from "@/lib/hotel-config";
import { PROJECT_CONFIG, OPENAI_MODEL } from "@/lib/project-config";

type ConversationMessage = {
  role: "user" | "ai";
  content: string;
};

type RequestBody = {
  message: string;
  stream?: boolean;
  conversationContext?: ConversationMessage[]; // Conversation history
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
 * Summary Context - Summarize conversation context (NO FILTERING)
 */
interface SummaryContext {
  conversationSummary: string;
  extractedInfo: {
    location?: string;
    priceRange?: string;
    tier?: string;
    keywords?: string[];
    amenities?: string[];
  };
  needsSummarization: boolean;
}

/**
 * Summarize conversation context using LLM (if needed)
 * Only summarizes if conversation is getting long (>3 messages or >500 chars)
 */
async function summarizeConversationContext(
  conversationContext: ConversationMessage[],
  currentMessage: string
): Promise<SummaryContext> {
  if (!conversationContext || conversationContext.length === 0) {
    return {
      conversationSummary: "No previous conversation context.",
      extractedInfo: {},
      needsSummarization: false,
    };
  }

  // Calculate total conversation length
  const totalLength = conversationContext.reduce((sum, msg) => sum + msg.content.length, 0) + currentMessage.length;
  const messageCount = conversationContext.length;

  // Only summarize if conversation is getting long
  const needsSummarization = 
    messageCount > PROJECT_CONFIG.conversation.summarizationThreshold.messageCount || 
    totalLength > PROJECT_CONFIG.conversation.summarizationThreshold.totalLength;

  if (!needsSummarization) {
    // Just extract key info from conversation without LLM
    const allMessages = [...conversationContext.map(m => m.content), currentMessage].join(" ");
    const extractedInfo: SummaryContext["extractedInfo"] = {};
    
    // Simple extraction
    if (allMessages.match(/\b(Melbourne|Sydney|Brisbane)\b/i)) {
      const match = allMessages.match(/\b(Melbourne|Sydney|Brisbane)\b/i);
      if (match) extractedInfo.location = match[1];
    }
    
    if (allMessages.match(/\$\s*(\d+)/)) {
      const match = allMessages.match(/\$\s*(\d+)/);
      if (match) extractedInfo.priceRange = `$${match[1]}`;
    }
    
    if (allMessages.match(/\b(Luxury|Budget|Mid-tier)\b/i)) {
      const match = allMessages.match(/\b(Luxury|Budget|Mid-tier)\b/i);
      if (match) extractedInfo.tier = match[1];
    }

    return {
      conversationSummary: `Previous conversation: ${conversationContext.length} message(s). Key info extracted.`,
      extractedInfo,
      needsSummarization: false,
    };
  }

  // Use LLM to summarize if conversation is long
  if (!process.env.OPENAI_API_KEY) {
    return {
      conversationSummary: "Conversation context available but summarization requires API key.",
      extractedInfo: {},
      needsSummarization: true,
    };
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const conversationText = conversationContext
    .map(msg => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
    .join("\n");

  const systemPrompt = `You are a conversation summarizer. Extract key hotel search information from the conversation history.

Extract:
- Location (Melbourne, Sydney, or Brisbane) if mentioned
- Price range (min/max) if mentioned
- Tier (Budget, Mid-tier, Luxury) if mentioned
- Keywords (quiet, family, luxury, etc.)
- Amenities (Pool, Spa, etc.)

Return ONLY a JSON object with this structure:
{
  "summary": "Brief summary of conversation",
  "location": "city name or null",
  "priceRange": "price info or null",
  "tier": "tier name or null",
  "keywords": ["keyword1", "keyword2"],
  "amenities": ["amenity1", "amenity2"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: PROJECT_CONFIG.openai.temperature.contextSummary,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Conversation history:\n${conversationText}\n\nCurrent message: ${currentMessage}` },
      ],
      response_format: { type: "json_object" },
      max_tokens: PROJECT_CONFIG.openai.maxTokens.contextSummary,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    const parsed = JSON.parse(content);

    return {
      conversationSummary: parsed.summary || "Conversation context summarized.",
      extractedInfo: {
        location: parsed.location || undefined,
        priceRange: parsed.priceRange || undefined,
        tier: parsed.tier || undefined,
        keywords: parsed.keywords || [],
        amenities: parsed.amenities || [],
      },
      needsSummarization: true,
    };
  } catch (error) {
    console.error("Error summarizing conversation:", error);
    return {
      conversationSummary: "Failed to summarize conversation context.",
      extractedInfo: {},
      needsSummarization: true,
    };
  }
}

/**
 * Merge conversation context into current query
 */
function mergeConversationContext(
  currentMessage: string,
  summaryContext: SummaryContext
): string {
  if (!summaryContext.extractedInfo || Object.keys(summaryContext.extractedInfo).length === 0) {
    return currentMessage;
  }

  const parts: string[] = [currentMessage];
  
  // Add location if missing in current message but present in context
  if (summaryContext.extractedInfo.location && !currentMessage.match(/\b(Melbourne|Sydney|Brisbane)\b/i)) {
    parts.push(`in ${summaryContext.extractedInfo.location}`);
  }
  
  // Add price info if missing
  if (summaryContext.extractedInfo.priceRange && !currentMessage.match(/\$\s*\d+/)) {
    parts.push(`under ${summaryContext.extractedInfo.priceRange}`);
  }
  
  // Add tier if missing
  if (summaryContext.extractedInfo.tier && !currentMessage.match(/\b(Luxury|Budget|Mid-tier)\b/i)) {
    parts.push(`${summaryContext.extractedInfo.tier.toLowerCase()} tier`);
  }

  return parts.join(" ");
}

/**
 * Build SQL query description for transparency (simplified version)
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

/**
 * Generate actual RPC SQL call with parameters filled in
 * This shows the exact SQL that will be executed in Supabase
 */
function generateActualRpcSql(
  hints: HotelSearchHints,
  embeddingLength: number
): string {
  const params: string[] = [];
  
  // query_embedding: vector(1536)
  params.push(`query_embedding: vector(1536) [${embeddingLength} dimensions]`);
  
  // p_location: text (required)
  params.push(`p_location: '${hints.location}'`);
  
  // p_min_price: int
  if (hints.minPrice !== null && hints.minPrice !== undefined) {
    params.push(`p_min_price: ${hints.minPrice}`);
  } else {
    params.push(`p_min_price: NULL`);
  }
  
  // p_max_price: int
  if (hints.maxPrice !== null && hints.maxPrice !== undefined) {
    params.push(`p_max_price: ${hints.maxPrice}`);
  } else {
    params.push(`p_max_price: NULL`);
  }
  
  // p_tier: text
  if (hints.tier) {
    params.push(`p_tier: '${hints.tier}'`);
  } else {
    params.push(`p_tier: NULL`);
  }
  
  // p_limit: int (increased to get more results for keyword/vector ranking)
  params.push(`p_limit: ${PROJECT_CONFIG.search.rpcLimit}`);
  
  // Note: Amenities are NOT filtered in SQL
  // They are used in keyword search for ranking instead
  if (hints.amenities && hints.amenities.length > 0) {
    params.push(`-- Amenities for keyword ranking: [${hints.amenities.join(', ')}]`);
  }
  
  const sqlBody = `
-- STAGE 1: SQL Filter (hard constraints only)
SELECT
  h.id,
  h.name,
  h.description,
  h.location,
  h.price_per_night,
  h.tier,
  h.amenities,
  1 - (h.description_embedding <-> query_embedding) AS similarity
FROM hotels h
WHERE
  h.is_active = true
  AND h.location = '${hints.location}'
  ${hints.minPrice !== null && hints.minPrice !== undefined ? `AND h.price_per_night >= ${hints.minPrice}` : '-- No min price filter'}
  ${hints.maxPrice !== null && hints.maxPrice !== undefined ? `AND h.price_per_night <= ${hints.maxPrice}` : '-- No max price filter'}
  ${hints.tier ? `AND h.tier = '${hints.tier}'` : '-- No tier filter'}
  -- NOTE: Amenities are NOT filtered here (used for ranking instead)
ORDER BY h.description_embedding <-> query_embedding
LIMIT 20;

-- STAGE 2: Vector + Keyword Search (done in application)
-- Keywords: ${hints.keywords?.join(', ') || 'from query'}
-- Amenities: ${hints.amenities?.join(', ') || 'none'}
-- Ranking: 50% Vector Similarity + 50% BM25 Keyword Score
`.trim();
  
  return `-- RPC Function Call: match_hotels_hybrid
-- Parameters:
${params.map(p => `--   ${p}`).join('\n')}

${sqlBody}`;
}

// Streaming generator for hotel search
async function* streamHotelSearch(
  userMessage: string,
  conversationContext?: ConversationMessage[]
): AsyncGenerator<string> {
  // Step 0: Summarize conversation context (if needed)
  yield JSON.stringify({ 
    step: "context_summary", 
    message: "📝 Step 0: Summarizing conversation context..." 
  });

  const summaryContext = await summarizeConversationContext(
    conversationContext || [],
    userMessage
  );

  yield JSON.stringify({
    step: "context_summary_complete",
    message: summaryContext.needsSummarization 
      ? "📝 Conversation context summarized" 
      : "📝 Conversation context reviewed",
    details: {
      summary: summaryContext.conversationSummary,
      extractedInfo: summaryContext.extractedInfo,
      needsSummarization: summaryContext.needsSummarization,
    }
  });

  // Merge conversation context into current query
  const enrichedQuery = mergeConversationContext(userMessage, summaryContext);

  // Step 1: Parsing query
  yield JSON.stringify({ step: "parsing", message: "🔍 Step 1: Extracting search parameters from your query..." });

  const hints: HotelSearchHints = await parseHotelQueryWithOpenAI(enrichedQuery);

  // Send extracted info
  yield JSON.stringify({
    step: "parsing_complete",
    message: "🔍 Search parameters extracted",
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
  yield JSON.stringify({ step: "embedding", message: "🧠 Step 2: Generating semantic embedding for vector search..." });

  const embedding = await buildEmbeddingFromQuery(enrichedQuery);

  yield JSON.stringify({
    step: "embedding_complete",
    message: "🧠 Semantic embedding generated (1536 dimensions)",
    details: {
      model: "text-embedding-3-small",
      dimensions: 1536
    }
  });

  // Step 3: Hybrid Search (SQL + Vector + BM25)
  yield JSON.stringify({ 
    step: "hybrid_search", 
    message: `📍 Step 3: Executing hybrid search (SQL filters + Vector similarity + Keyword matching) in ${hints.location}...`
  });

  // Step 3.1: Show Actual RPC SQL Code with Parameters
  const actualRpcSql = generateActualRpcSql(hints, embedding.length);
  yield JSON.stringify({
    step: "rpc_sql_code",
    message: "📋 Step 3.1: Executing SQL query with filters (location, price, tier)",
    details: {
      rpcFunction: "match_hotels_hybrid",
      sqlCode: actualRpcSql,
      explanation: "SQL filters (location, price, tier) first, then vector similarity ranking. Amenities are used for keyword ranking, not SQL filtering.",
      parameters: {
        query_embedding: `vector(1536) - ${embedding.length} dimensions`,
        p_location: hints.location,
        p_min_price: hints.minPrice ?? null,
        p_max_price: hints.maxPrice ?? null,
        p_tier: hints.tier ?? null,
        p_limit: PROJECT_CONFIG.search.rpcLimit,
      },
      keywordRanking: {
        amenities: hints.amenities || [],
        keywords: hints.keywords || [],
      }
    }
  });

  const { data, error } = await supabaseRpcWithRetry("match_hotels_hybrid", {
    query_embedding: embedding,
    p_location: hints.location,
    p_min_price: hints.minPrice ?? null,
    p_max_price: hints.maxPrice ?? null,
    p_tier: hints.tier ?? null,
    p_limit: 20,
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

  // Step 3.2: Show Final Similarity Scores from RPC
  yield JSON.stringify({
    step: "rpc_similarity_scores",
    message: `🔍 Step 3.2: Calculating vector similarity scores (semantic matching)`,
    details: {
      explanation: "These similarity scores are calculated using cosine similarity between query embedding and hotel description embeddings. Range: -1 to 1 (higher is better).",
      method: "1 - (description_embedding <-> query_embedding)",
      totalHotels: hotels.length,
      scores: hotels
        .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
        .slice(0, 15)
        .map((h, i) => ({
          rank: i + 1,
          id: h.id,
          name: h.name,
          similarity: h.similarity,
          similarityPercent: Math.round(((h.similarity + 1) / 2) * 100), // Convert -1..1 to 0..100%
          price: h.price_per_night,
          tier: h.tier,
        })),
      scoreRange: {
        min: hotels.length > 0 ? Math.min(...hotels.map(h => h.similarity || 0)) : 0,
        max: hotels.length > 0 ? Math.max(...hotels.map(h => h.similarity || 0)) : 0,
        avg: hotels.length > 0 
          ? hotels.reduce((sum, h) => sum + (h.similarity || 0), 0) / hotels.length 
          : 0,
      }
    }
  });

  // Step 3.3: BM25 Keyword Search Results
  const hotelsWithKeywordScore = hotels.map(hotel => ({
    ...hotel,
    keywordScore: calculateKeywordScore(hotel, hints.keywords || [], userMessage)
  }));
  
  const bm25Results = [...hotelsWithKeywordScore].sort((a, b) => (b.keywordScore || 0) - (a.keywordScore || 0));
  
  yield JSON.stringify({
    step: "bm25_results",
    message: "🔤 Step 3.3: Calculating BM25 keyword matching scores",
    details: {
      explanation: "BM25 scoring calculates relevance based on keyword frequency in hotel name, description, and amenities. Higher score = more keyword matches.",
      method: "BM25-style term frequency matching",
      formula: "TF = (tf × (k1 + 1)) / (tf + k1 × (1 - b + b × (docLength / avgDocLength)))",
      parameters: {
        k1: 1.5,
        b: 0.75,
      },
      keywords: hints.keywords || [],
      results: bm25Results.slice(0, 10).map((h, i) => ({
        rank: i + 1,
        id: h.id,
        name: h.name,
        keywordScore: h.keywordScore || 0,
        keywordScorePercent: Math.round((h.keywordScore || 0) * 100) + "%"
      }))
    }
  });

  // Step 3.4: Combined Ranking (50% Vector + 50% BM25)
  // Sort STRICTLY by combined score (highest first)
  // Price is only used as tie-breaker when scores are EXACTLY equal
  const combinedResults = hotelsWithKeywordScore.map(hotel => {
    const normalizedVectorScore = (hotel.similarity + 1) / 2; // Convert -1..1 to 0..1
    const keywordScore = hotel.keywordScore || 0;
    const combinedScore = calculateCombinedScore(hotel.similarity, keywordScore, 0.5);
    
    return {
      ...hotel,
      normalizedVectorScore,
      combinedScore,
    };
  }).sort((a, b) => {
    const scoreA = a.combinedScore || 0;
    const scoreB = b.combinedScore || 0;
    
    // PRIMARY: Sort by combined score (highest first) - ALWAYS
    if (scoreA !== scoreB) {
      return scoreB - scoreA; // Higher score first
    }
    
    // SECONDARY: Only if scores are EXACTLY equal, prefer lower price
    return a.price_per_night - b.price_per_night;
  });

  yield JSON.stringify({
    step: "combined_ranking",
    message: "⚖️ Step 3.4: Computing final match scores (50% Vector + 50% BM25) and sorting by highest score",
    details: {
      explanation: "Final match score combines vector similarity (semantic meaning) and keyword matching (exact terms). This gives balanced results.",
      formula: "combinedScore = normalizedVectorScore × 0.5 + keywordScore × 0.5",
      formulaDetails: {
        normalizedVectorScore: "Convert similarity from range (-1 to 1) to (0 to 1)",
        vectorWeight: "50% - Semantic similarity weight",
        keywordWeight: "50% - Keyword matching weight",
      },
      results: combinedResults.slice(0, 10).map((h, i) => ({
        rank: i + 1,
        id: h.id,
        name: h.name,
        vectorSimilarity: h.similarity,
        normalizedVectorScore: h.normalizedVectorScore,
        vectorScorePercent: Math.round(h.normalizedVectorScore * 100) + "%",
        keywordScore: h.keywordScore || 0,
        keywordScorePercent: Math.round((h.keywordScore || 0) * 100) + "%",
        combinedScore: h.combinedScore || 0,
        combinedScorePercent: Math.round((h.combinedScore || 0) * 100) + "%"
      }))
    }
  });

  // Step 4: Validate data integrity
  yield JSON.stringify({ 
    step: "validating", 
    message: "✅ Step 4: Validating data integrity & quality checks...",
    details: {
      explanation: "Validating each hotel against quality criteria to ensure consistent, accurate results.",
      validationCriteria: {
        priceCheck: "Price must be positive and non-zero",
        tierPriceConsistency: "Hotel tier must match price range (Budget: <$150, Mid-tier: $150-$350, Luxury: >$350)",
        locationCheck: "Must be a valid city (Melbourne, Sydney, Brisbane)",
        similarityCheck: "Vector similarity score must be in valid range (-1 to 1)",
        nameCheck: "Hotel name must exist and not be empty",
        amenitiesCheck: "Amenities array must be valid (can be empty)"
      }
    }
  });

  const validatedHotels: HotelSearchResult[] = [];
  const validationDetails: Array<{ 
    hotelId: number; 
    hotelName: string; 
    price: number;
    tier: string | null;
    valid: boolean; 
    reason?: string;
    checks: { [key: string]: boolean | string };
  }> = [];
  
  for (const hotel of combinedResults) {
    const validation = validateHotelResult(hotel);
    
    // Detailed validation checks
    const checks: { [key: string]: boolean | string } = {
      priceValid: hotel.price_per_night > 0 ? "✅ Pass" : "❌ Invalid price",
      locationValid: ["Melbourne", "Sydney", "Brisbane"].includes(hotel.location) ? "✅ Pass" : "❌ Invalid location",
      nameValid: hotel.name && hotel.name.trim().length > 0 ? "✅ Pass" : "❌ Missing name",
      similarityValid: hotel.similarity >= -1 && hotel.similarity <= 1 ? "✅ Pass" : "❌ Invalid similarity",
    };
    
    // Tier-price consistency check
    if (hotel.tier === "Budget" && hotel.price_per_night <= 150) {
      checks.tierPriceConsistency = "✅ Pass";
    } else if (hotel.tier === "Mid-tier" && hotel.price_per_night > 150 && hotel.price_per_night <= 350) {
      checks.tierPriceConsistency = "✅ Pass";
    } else if (hotel.tier === "Luxury" && hotel.price_per_night > 350) {
      checks.tierPriceConsistency = "✅ Pass";
    } else if (!hotel.tier) {
      checks.tierPriceConsistency = "⚠️ No tier";
    } else {
      checks.tierPriceConsistency = `⚠️ Mismatch: ${hotel.tier} at $${hotel.price_per_night}`;
    }
    
    // Amenities matching check (for user reference)
    if (hints.amenities && hints.amenities.length > 0 && hotel.amenities) {
      const matchedAmenities = hints.amenities.filter(a => 
        hotel.amenities?.some(ha => ha.toLowerCase().includes(a.toLowerCase()))
      );
      checks.amenitiesMatch = matchedAmenities.length > 0 
        ? `✅ ${matchedAmenities.length}/${hints.amenities.length} matched` 
        : "⚠️ No amenities matched";
    } else {
      checks.amenitiesMatch = "N/A";
    }
    
    validationDetails.push({
      hotelId: hotel.id,
      hotelName: hotel.name,
      price: hotel.price_per_night,
      tier: hotel.tier,
      valid: validation.valid,
      reason: validation.reason,
      checks,
    });
    
    if (validation.valid) {
      validatedHotels.push(hotel);
    } else {
      console.warn(`Invalid hotel filtered out: ${hotel.name} (ID: ${hotel.id}) - ${validation.reason}`);
    }
  }

  yield JSON.stringify({
    step: "validation_complete",
    message: `✅ Validated: ${validatedHotels.length}/${combinedResults.length} hotels passed quality checks`,
    details: {
      explanation: "Hotels that fail validation are filtered out. Details show each hotel's validation status.",
      summary: {
        totalChecked: combinedResults.length,
        passed: validatedHotels.length,
        failed: combinedResults.length - validatedHotels.length,
      },
      passedHotels: validationDetails.filter(v => v.valid).slice(0, 10).map(v => ({
        id: v.hotelId,
        name: v.hotelName,
        price: `$${v.price}/night`,
        tier: v.tier || "N/A",
        checks: v.checks,
      })),
      failedHotels: validationDetails.filter(v => !v.valid).map(v => ({
        id: v.hotelId,
        name: v.hotelName,
        reason: v.reason,
        checks: v.checks,
      })),
    }
  });

  // Step 5: Final Ranking (LLM re-ranking only if needed, otherwise keep sorted by match score)
  yield JSON.stringify({ 
    step: "llm_reranking", 
    message: "📊 Step 5: Applying final ranking (highest match score first)...",
    details: {
      explanation: "Hotels are sorted strictly by combined match score (highest first). Price is only used as tie-breaker when scores are exactly equal.",
      sortByPrice: hints.sortByPrice,
      userIntent: hints.sortByPrice === "asc" ? "Cheapest first" : hints.sortByPrice === "desc" ? "Most expensive first" : "Highest match score first"
    }
  });

  // LLM Re-ranking (only for special cases, otherwise keeps sorted by match score)
  const rerankedHotels = await llmReRankHotels(validatedHotels, userMessage, hints);
  
  yield JSON.stringify({
    step: "llm_reranking_complete",
    message: `✅ Final ranking complete: ${rerankedHotels.length} hotels sorted by highest match score`,
    details: {
      explanation: hints.sortByPrice 
        ? `Hotels sorted by price (${hints.sortByPrice === "asc" ? "lowest to highest" : "highest to lowest"})` 
        : "Hotels sorted by combined match score (highest first)",
      topResults: rerankedHotels.slice(0, 5).map((h, i) => ({
        rank: i + 1,
        name: h.name,
        price: h.price_per_night,
        matchScore: Math.round((h.combinedScore || 0) * 100) + "%"
      }))
    }
  });

  // Limit results to configured range
  const finalHotels = rerankedHotels.slice(0, Math.min(
    PROJECT_CONFIG.search.maxResults, 
    Math.max(PROJECT_CONFIG.search.minResults, rerankedHotels.length)
  ));

  // Step 6: Generate natural language response (streaming)
  yield JSON.stringify({ 
    step: "generating_response", 
    message: `💬 Step 6: Generating personalized recommendations...` 
  });

  // Stream natural language response word by word
  let fullResponse = "";
  for await (const chunk of generateNaturalResponseStreaming(finalHotels, hints)) {
    fullResponse += chunk;
    yield JSON.stringify({
      type: "response_chunk",
      chunk: chunk,
    });
  }

  // Mark response complete
  yield JSON.stringify({
    type: "response_complete",
    message: fullResponse,
  });

  // Step 7: Send hotel results
  yield JSON.stringify({ 
    step: "found", 
    message: `✨ Step 7: Showing top ${finalHotels.length} hotel${finalHotels.length > 1 ? 's' : ''} (sorted by highest match score)` 
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

  // Final results summary
  yield JSON.stringify({
    type: "results",
    message: fullResponse,
    hints,
    hotels: finalHotels,
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
    const conversationContext = body.conversationContext || [];

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
      return createStreamResponse(streamHotelSearch(userMessage, conversationContext));
    }

    // Non-streaming fallback
    // Summarize conversation context first
    const summaryContext = await summarizeConversationContext(conversationContext, userMessage);
    const enrichedQuery = mergeConversationContext(userMessage, summaryContext);
    
    const hints: HotelSearchHints = await parseHotelQueryWithOpenAI(enrichedQuery);

    if (!hints.location) {
      return Response.json({
        type: "clarification",
        message: "I can help you find a hotel, but first tell me which city you want: Melbourne, Sydney, or Brisbane?",
        missingFields: ["location"],
        partialHints: hints,
      });
    }

    const embedding = await buildEmbeddingFromQuery(enrichedQuery);

    const { data, error } = await supabaseRpcWithRetry("match_hotels_hybrid", {
      query_embedding: embedding,
      p_location: hints.location,
      p_min_price: hints.minPrice ?? null,
      p_max_price: hints.maxPrice ?? null,
      p_tier: hints.tier ?? null,
      p_limit: 20,
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
    // When similarity scores are similar, prioritize lower price
    const rankedHotels = hotelsWithScores.map(hotel => ({
      ...hotel,
      combinedScore: calculateCombinedScore(hotel.similarity, hotel.keywordScore, 0.5)
    })).sort((a, b) => {
      const scoreA = a.combinedScore || 0;
      const scoreB = b.combinedScore || 0;
      const scoreDiff = Math.abs(scoreA - scoreB);
      
      // If scores are very similar (difference < 0.05 or 5%), prioritize lower price
      if (scoreDiff < 0.05) {
        return a.price_per_night - b.price_per_night; // Lower price first
      }
      
      // Otherwise, sort by combined score (higher first)
      return scoreB - scoreA;
    });

    // Validate hotels
    const validatedHotels: HotelSearchResult[] = [];
    for (const hotel of rankedHotels) {
      const validation = validateHotelResult(hotel);
      if (validation.valid) {
        validatedHotels.push(hotel);
      }
    }

    // Limit results
    const finalHotels = validatedHotels.slice(0, Math.min(
      PROJECT_CONFIG.search.maxResults, 
      Math.max(PROJECT_CONFIG.search.minResults, validatedHotels.length)
    ));

    return Response.json({
      type: "results",
      message: await generateNaturalResponse(finalHotels, hints),
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
