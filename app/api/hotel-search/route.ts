import { NextRequest } from "next/server";
import { supabaseRpcWithRetry } from "@/lib/supabase";
import {
  HotelSearchHints,
  HotelSearchResult,
  buildEmbeddingFromQuery,
  parseHotelQueryWithOpenAI,
  validateAndFormatResultsWithLLM,
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

// Streaming generator for hotel search
async function* streamHotelSearch(userMessage: string): AsyncGenerator<string> {
  // Step 1: Parsing query
  yield JSON.stringify({ step: "parsing", message: "🔍 Analyzing your request..." });

  const hints: HotelSearchHints = await parseHotelQueryWithOpenAI(userMessage);

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
  yield JSON.stringify({ step: "embedding", message: "🧠 Understanding semantic meaning..." });

  const embedding = await buildEmbeddingFromQuery(userMessage);

  // Step 3: Searching database
  yield JSON.stringify({ step: "searching", message: `📍 Searching hotels in ${hints.location}...` });

  const { data, error } = await supabaseRpcWithRetry("match_hotels_hybrid", {
    query_embedding: embedding,
    p_location: hints.location,
    p_min_price: hints.minPrice ?? null,
    p_max_price: hints.maxPrice ?? null,
    p_tier: hints.tier ?? null,
    p_amenities: hints.amenities && hints.amenities.length > 0 ? hints.amenities : null,
    p_limit: 10,
  });

  if (error) {
    console.error("Supabase RPC error:", error);
    yield JSON.stringify({ 
      type: "error", 
      message: "Search failed due to connection issues. Please try again in a moment." 
    });
    return;
  }

  // Map và sort hotels theo similarity (cao đến thấp)
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

  // Step 4: Basic validation - filter out invalid hotels
  yield JSON.stringify({ step: "validating", message: "✅ Validating data integrity..." });

  const validatedHotels: HotelSearchResult[] = [];
  for (const hotel of hotels) {
    const validation = validateHotelResult(hotel);
    if (validation.valid) {
      validatedHotels.push(hotel);
    } else {
      console.warn(`Invalid hotel filtered out: ${hotel.name} (ID: ${hotel.id}) - ${validation.reason}`);
    }
  }

  // Sort theo similarity từ cao xuống thấp
  validatedHotels.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

  // Lấy top 10 để LLM validate
  const candidateHotels = validatedHotels.slice(0, 10);

  // Step 5: LLM Validation - kiểm tra kết quả có thực sự phù hợp không
  yield JSON.stringify({ step: "llm_validating", message: "🤖 AI is evaluating matches..." });

  const llmResult = await validateAndFormatResultsWithLLM(userMessage, hints, candidateHotels);

  // Lấy tất cả hotels đã được LLM đánh giá và sort (không filter)
  const allValidHotels = llmResult.validHotels.map((v) => v.hotel);
  const allMatchReasons = llmResult.validHotels.map((v) => ({
    hotelId: v.hotel.id,
    matchScore: v.matchScore,
    matchReason: v.matchReason,
  }));

  // Giới hạn kết quả từ 3-5 hotels (hoặc ít hơn nếu không đủ)
  const minResults = 3;
  const maxResults = 5;
  const finalHotels = allValidHotels.slice(0, Math.min(maxResults, Math.max(minResults, allValidHotels.length)));
  const matchReasons = allMatchReasons.filter((m) => finalHotels.some((h) => h.id === m.hotelId));

  // Step 6: Send results (limited to 3-5 hotels)
  
  yield JSON.stringify({ 
    step: "found", 
    message: `✨ Found ${finalHotels.length} hotel${finalHotels.length > 1 ? 's' : ''} matching your request!` 
  });

  // Send hotels one by one for streaming effect
  for (let i = 0; i < finalHotels.length; i++) {
    const matchInfo = matchReasons.find((m) => m.hotelId === finalHotels[i].id);
    yield JSON.stringify({
      type: "hotel",
      index: i,
      hotel: finalHotels[i],
      matchScore: matchInfo?.matchScore,
      matchReason: matchInfo?.matchReason,
    });
  }

  // Final summary with natural response from LLM
  yield JSON.stringify({
    type: "results",
    message: llmResult.naturalResponse,
    hints,
    hotels: finalHotels,
    matchReasons,
  });
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
      p_limit: 10,
    });

    if (error) {
      console.error("Supabase RPC error:", error);
      return Response.json({ error: "Search failed due to connection issues" }, { status: 503 });
    }

    // Map và sort hotels theo similarity (cao đến thấp)
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

    // Basic validation - filter out invalid hotels
    const validatedHotels: HotelSearchResult[] = [];
    for (const hotel of hotels) {
      const validation = validateHotelResult(hotel);
      if (validation.valid) {
        validatedHotels.push(hotel);
      } else {
        console.warn(`Invalid hotel filtered out: ${hotel.name} (ID: ${hotel.id}) - ${validation.reason}`);
      }
    }

    // Sort theo similarity từ cao xuống thấp
    validatedHotels.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    const candidateHotels = validatedHotels.slice(0, 10);

    // LLM Validation (no filtering, just sorting)
    const llmResult = await validateAndFormatResultsWithLLM(userMessage, hints, candidateHotels);
    const allValidHotels = llmResult.validHotels.map((v) => v.hotel);
    const allMatchReasons = llmResult.validHotels.map((v) => ({
      hotelId: v.hotel.id,
      matchScore: v.matchScore,
      matchReason: v.matchReason,
    }));

    // Giới hạn kết quả từ 3-5 hotels (hoặc ít hơn nếu không đủ)
    const minResults = 3;
    const maxResults = 5;
    const finalHotels = allValidHotels.slice(0, Math.min(maxResults, Math.max(minResults, allValidHotels.length)));
    const matchReasons = allMatchReasons.filter((m) => finalHotels.some((h) => h.id === m.hotelId));

    return Response.json({
      type: "results",
      message: llmResult.naturalResponse,
      hints,
      hotels: finalHotels,
      matchReasons,
    });
  } catch (err) {
    console.error("Hotel search API error:", err);
    return Response.json({ error: "Unexpected server error" }, { status: 500 });
  }
}


