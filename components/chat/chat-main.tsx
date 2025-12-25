"use client";

import { useState, useRef } from "react";
import { ChatWelcomeScreen } from "./chat-welcome-screen";
import { ChatConversationView } from "./chat-conversation-view";
import { Hotel } from "@/components/hotel/hotel-card";
import { Message } from "./chat-message";
import { ReasoningFlowData, ReasoningStep } from "./reasoning-flow-modal";

export function ChatMain() {
  const [message, setMessage] = useState("");
  const [isConversationStarted, setIsConversationStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingBaseQuery, setPendingBaseQuery] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const streamingMessageId = useRef<string | null>(null);

  const appendMessage = (content: string, sender: "user" | "ai", hotels?: Hotel[], isStreaming?: boolean) => {
    const id = `${Date.now()}-${Math.random()}`;
    setMessages((prev) => [
      ...prev,
      {
        id,
        content,
        sender,
        timestamp: new Date(),
        hotels,
        isStreaming,
      },
    ]);
    return id;
  };

  const updateMessage = (id: string, updates: Partial<Message>) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === id ? { ...msg, ...updates } : msg))
    );
  };

  // Build reasoning data from collected info
  const buildReasoningData = (
    query: string,
    hints: any,
    hotelsCount: number,
    validatedCount: number,
    finalCount: number,
    summaryContext?: any
  ): ReasoningFlowData => {
    const steps: ReasoningStep[] = [
      {
        id: "extract",
        title: "Step 1: Extract Information from Query",
        icon: "🔍",
        description: "Analyzed your natural language query to identify search criteria",
        details: {
          input: query,
          output: `Location: ${hints?.location || "Not specified"}, Price: ${hints?.maxPrice ? `≤ $${hints.maxPrice}` : hints?.minPrice ? `≥ $${hints.minPrice}` : "Any"}, Tier: ${hints?.tier || "Any"}`,
          reasoning: "Used GPT-4o-mini to parse natural language and extract structured search parameters",
          data: {
            location: hints?.location || "Not specified",
            priceRange: hints?.maxPrice ? `≤ $${hints.maxPrice}` : "Any",
            tier: hints?.tier || "Any",
            keywords: hints?.keywords || [],
            amenities: hints?.amenities || []
          }
        }
      },
      {
        id: "embedding",
        title: "Step 2: Create Embedding",
        icon: "🧠",
        description: "Converted query into a 1536-dimensional vector for semantic matching",
        details: {
          input: query,
          output: "1536-dimensional vector",
          reasoning: "Used text-embedding-3-small model to create semantic representation.",
          data: {
            model: "text-embedding-3-small",
            dimensions: 1536
          }
        }
      },
      {
        id: "hybrid_search",
        title: "Step 3: Hybrid Search (SQL + Vector + BM25)",
        icon: "📍",
        description: "Combined SQL filters, vector similarity, and keyword matching",
        details: {
          reasoning: "Multi-stage search combining hard filters with semantic and keyword relevance",
          data: {
            "3.1 SQL Filters": `location='${hints?.location}', price, tier, amenities`,
            "3.2 Vector Search": "Cosine similarity ranking",
            "3.3 BM25 Keyword": "Term frequency matching",
            "3.4 Combined Score": "50% Vector + 50% BM25",
            "Hotels found": hotelsCount
          }
        }
      },
      {
        id: "validate",
        title: "Step 4: Validate Results",
        icon: "✅",
        description: "Checked data integrity and filtered invalid hotels",
        details: {
          reasoning: "Ensured all hotels have valid data before returning",
          data: {
            "Total checked": hotelsCount,
            "Passed validation": validatedCount
          }
        }
      },
      {
        id: "summary_context",
        title: "Step 5: Summary Context & Filter Irrelevant",
        icon: "📝",
        description: "Summarized context and filtered out contradicting results based on query intent",
        details: {
          reasoning: "Analyzed query intent to remove hotels that contradict the user's needs",
          data: {
            "Query Intent": summaryContext?.queryIntent || "general_search",
            "Relevant Filters": summaryContext?.relevantFilters?.join(", ") || "All filters applied",
            "Hotels after intent filter": summaryContext?.relevantHotels?.length || finalCount,
            "Filtered out (contradicting)": summaryContext?.filteredOutHotels?.length || 0,
            "Context Summary": summaryContext?.contextSummary || "No contradicting results found"
          }
        }
      },
      {
        id: "response",
        title: "Step 6: Return Top Results",
        icon: "✨",
        description: "Returned top 3-5 hotels sorted by combined score",
        details: {
          reasoning: "Final ranking by combinedScore = vectorScore × 0.5 + keywordScore × 0.5",
          data: {
            "Results shown": finalCount
          }
        }
      }
    ];

    return {
      query,
      steps,
      totalTime: "~2-4s"
    };
  };

  const callHotelSearchStreaming = async (userContent: string) => {
    setIsLoading(true);
    
    // Create placeholder message for streaming
    const messageId = appendMessage("", "ai", undefined, true);
    streamingMessageId.current = messageId;
    
    // Collect data for reasoning flow
    let collectedHints: any = null;
    let hotelsFoundCount = 0;
    let validatedCount = 0;
    let summaryContext: any = null;
    
    try {
      const response = await fetch("/api/hotel-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userContent, stream: true }),
      });

      if (!response.ok) {
        throw new Error("API request failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let streamContent = "";
      let collectedHotels: Hotel[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.replace("data: ", "");
          
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.step) {
              // Progress message
              streamContent = parsed.message;
              updateMessage(messageId, { content: streamContent, isStreaming: true });
              
              // Collect summary context data
              if (parsed.step === "summary_context_complete" && parsed.details) {
                summaryContext = parsed.details;
              }
            } else if (parsed.type === "hotel") {
              // Individual hotel - merge matchScore into hotel object
              const hotelWithScore = {
                ...parsed.hotel,
                matchScore: parsed.matchScore,
                matchReason: parsed.matchReason,
              };
              collectedHotels.push(hotelWithScore);
              hotelsFoundCount = collectedHotels.length;
              updateMessage(messageId, { 
                content: `Found ${collectedHotels.length} hotels...`,
                hotels: [...collectedHotels],
                isStreaming: true
              });
            } else if (parsed.type === "clarification") {
              // Clarification needed
              setPendingBaseQuery(userContent);
              updateMessage(messageId, { 
                content: parsed.message, 
                isStreaming: false 
              });
            } else if (parsed.type === "results") {
              // Final results - merge matchReasons into hotels
              const hotelsWithScores = (parsed.hotels || []).map((hotel: Hotel) => {
                const matchInfo = parsed.matchReasons?.find((m: any) => m.hotelId === hotel.id);
                return {
                  ...hotel,
                  matchScore: matchInfo?.matchScore,
                  matchReason: matchInfo?.matchReason,
                };
              });
              
              // Store hints and summary context for reasoning data
              collectedHints = parsed.hints;
              validatedCount = hotelsFoundCount;
              if (parsed.summaryContext) {
                summaryContext = parsed.summaryContext;
              }
              
              // Build reasoning data
              const reasoningData = buildReasoningData(
                userContent,
                collectedHints,
                hotelsFoundCount,
                validatedCount,
                hotelsWithScores.length,
                summaryContext
              );
              
              setPendingBaseQuery(null);
              updateMessage(messageId, { 
                content: parsed.message,
                hotels: hotelsWithScores,
                reasoningData,
                isStreaming: false
              });
            } else if (parsed.type === "error") {
              updateMessage(messageId, { 
                content: parsed.message, 
                isStreaming: false 
              });
            }
          } catch (e) {
            console.error("Failed to parse SSE data:", e);
          }
        }
      }
    } catch (error) {
      console.error("Error calling hotel-search API:", error);
      updateMessage(streamingMessageId.current!, {
        content: "I had trouble reaching the hotel search service. Please try again in a moment.",
        isStreaming: false,
      });
    } finally {
      setIsLoading(false);
      streamingMessageId.current = null;
    }
  };

  const handleSend = () => {
    if (!message.trim() || isLoading) return;

    setIsConversationStarted(true);

    const content = message;
    appendMessage(content, "user");
    void callHotelSearchStreaming(content);
    setMessage("");
  };

  const handleReset = () => {
    setIsConversationStarted(false);
    setMessages([]);
    setMessage("");
    setPendingBaseQuery(null);
    setIsLoading(false);
  };

  const handleSendMessage = (content: string) => {
    if (isLoading) return;
    
    const fullQuery = pendingBaseQuery
      ? `${pendingBaseQuery} ${content}`
      : content;

    appendMessage(content, "user");
    void callHotelSearchStreaming(fullQuery);
    setMessage("");
  };

  if (isConversationStarted) {
    return (
      <ChatConversationView
        messages={messages}
        message={message}
        onMessageChange={setMessage}
        onSend={handleSendMessage}
        onReset={handleReset}
        isLoading={isLoading}
      />
    );
  }

  return (
    <ChatWelcomeScreen
      message={message}
      onMessageChange={setMessage}
      onSend={handleSend}
    />
  );
}
