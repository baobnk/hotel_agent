"use client";

import { useState, useRef } from "react";
import { ChatWelcomeScreen } from "./chat-welcome-screen";
import { ChatConversationView } from "./chat-conversation-view";
import { Hotel } from "@/components/hotel/hotel-card";
import { Message } from "./chat-message";
import { ReasoningFlowData, ReasoningStep } from "./reasoning-flow-modal";
import { PROJECT_CONFIG } from "@/lib/project-config";

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
    rpcSqlCode?: string,
    similarityScores?: Array<{ id: number; name: string; similarity: number; similarityPercent: number; price: number; tier: string | null }>
  ): ReasoningFlowData => {
    const steps: ReasoningStep[] = [
      {
        id: "context",
        title: "Step 0: Context Summary",
        icon: "📝",
        description: "Analyzed conversation history for relevant context",
        details: {
          reasoning: "Summarize previous messages to maintain conversation continuity",
          data: {
            "Query": query,
          }
        }
      },
      {
        id: "extract",
        title: "Step 1: Extract Search Parameters",
        icon: "🔍",
        description: "Extracted structured search criteria from natural language",
        details: {
          input: query,
          output: `Location: ${hints?.location || "Not specified"}, Price: ${hints?.maxPrice ? `≤ $${hints.maxPrice}` : hints?.minPrice ? `≥ $${hints.minPrice}` : "Any"}, Tier: ${hints?.tier || "Any"}`,
          reasoning: "Used GPT-4.1-mini to parse natural language and extract structured search parameters",
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
        title: "Step 2: Generate Semantic Embedding",
        icon: "🧠",
        description: "Created 1536-dimension vector for semantic search",
        details: {
          reasoning: "Used text-embedding-3-small to convert query to vector representation",
          data: {
            "Model": "text-embedding-3-small",
            "Dimensions": "1536",
          }
        }
      },
      {
        id: "hybrid_search",
        title: "Step 3: Hybrid Search",
        icon: "📍",
        description: "Combined SQL filters, vector similarity, and keyword matching",
        details: {
          reasoning: "Multi-stage search: SQL filters → Vector similarity → BM25 keyword matching → Combined ranking",
          data: {
            "SQL Filters": "Location, Price, Tier",
            "Vector Search": "Cosine similarity (50%)",
            "BM25 Keyword": "Term frequency matching (50%)",
            "Hotels found": hotelsCount,
            ...(rpcSqlCode && { "SQL RPC Code": rpcSqlCode }),
            ...(similarityScores && similarityScores.length > 0 && {
              "Top 5 Results (by Match Score)": similarityScores.slice(0, 5).map((h, i) => 
                `${i + 1}. ${h.name} (${h.similarityPercent}% match, $${h.price}/night${h.tier ? `, ${h.tier}` : ""})`
              ).join("; ")
            })
          }
        }
      },
      {
        id: "validate",
        title: "Step 4: Validate Results",
        icon: "✅",
        description: "Checked data integrity and quality criteria",
        details: {
          reasoning: "Ensured all hotels have valid data (price, location, tier consistency)",
          data: {
            "Total checked": hotelsCount,
            "Passed validation": validatedCount
          }
        }
      },
      {
        id: "ranking",
        title: "Step 5: Final Ranking",
        icon: "📊",
        description: "Sorted by highest match score (score ties broken by price)",
        details: {
          reasoning: "Hotels ranked by combinedScore = vectorScore × 0.5 + keywordScore × 0.5",
          data: {
            "Ranking method": "Highest match score first",
            "Tie-breaker": "Lower price preferred"
          }
        }
      },
      {
        id: "response",
        title: "Step 6: Generate Response",
        icon: "💬",
        description: "Created personalized hotel recommendations",
        details: {
          reasoning: "Used GPT-4.1-mini to generate natural language recommendations",
          data: {
            "Response style": "Hotel booking consultant"
          }
        }
      },
      {
        id: "results",
        title: "Step 7: Return Results",
        icon: "✨",
        description: `Returned top ${finalCount} hotels sorted by match score`,
        details: {
          reasoning: "Final results with match scores and reasons",
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
    let rpcSqlCode: string | undefined = undefined;
    let similarityScores: Array<{ id: number; name: string; similarity: number; similarityPercent: number; price: number; tier: string | null }> = [];
    
    try {
      // Build conversation context from previous messages
      const conversationContext = messages
        .filter(msg => msg.sender === "user" || msg.sender === "ai")
        .slice(-PROJECT_CONFIG.conversation.maxContextMessages) // Last N messages to avoid too long context
        .map(msg => ({
          role: msg.sender === "user" ? "user" as const : "ai" as const,
          content: msg.content,
        }));

      const response = await fetch("/api/hotel-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: userContent, 
          stream: true,
          conversationContext,
        }),
      });

      if (!response.ok) {
        throw new Error("API request failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let streamContent = "";
      let streamingResponse = ""; // For streaming natural language response
      let collectedHotels: Hotel[] = [];
      let stepMessages: string[] = []; // Accumulate all step messages

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
              // Accumulate step messages (don't overwrite, append)
              if (parsed.message && !stepMessages.includes(parsed.message)) {
                stepMessages.push(parsed.message);
              }
              
              // Display all accumulated step messages with visual indicators
              // Format: ✓ Step 1: ... \n ✓ Step 2: ... \n ⏳ Step 3: ... (current)
              const formattedSteps = stepMessages.map((msg, idx) => {
                const isLast = idx === stepMessages.length - 1;
                // Keep emoji for current step, remove for completed steps
                const cleanMsg = msg.replace(/^[^\s]+\s/, '');
                return isLast ? `⏳ ${msg}` : `✓ ${cleanMsg}`;
              });
              streamContent = formattedSteps.join("\n");
              updateMessage(messageId, { content: streamContent, isStreaming: true });
              
              // Collect RPC SQL code
              if (parsed.step === "rpc_sql_code" && parsed.details?.sqlCode) {
                rpcSqlCode = parsed.details.sqlCode;
              }
              
              // Collect similarity scores
              if (parsed.step === "rpc_similarity_scores" && parsed.details?.scores) {
                similarityScores = parsed.details.scores.map((s: any) => ({
                  id: s.id,
                  name: s.name,
                  similarity: s.similarity,
                  similarityPercent: s.similarityPercent,
                  price: s.price,
                  tier: s.tier
                }));
              }
              
              // Collect summary context data
              if (parsed.step === "summary_context_complete" && parsed.details) {
                summaryContext = parsed.details;
              }
            } else if (parsed.type === "response_chunk") {
              // Streaming natural language response - word by word
              // Clear step messages and show streaming response
              streamingResponse += parsed.chunk;
              updateMessage(messageId, { 
                content: streamingResponse,
                isStreaming: true
              });
            } else if (parsed.type === "response_complete") {
              // Response streaming complete
              streamingResponse = parsed.message;
              updateMessage(messageId, { 
                content: streamingResponse,
                isStreaming: true
              });
            } else if (parsed.type === "hotel") {
              // Individual hotel - merge matchScore into hotel object
              const hotelWithScore = {
                ...parsed.hotel,
                matchScore: parsed.matchScore,
                matchReason: parsed.matchReason,
              };
              collectedHotels.push(hotelWithScore);
              hotelsFoundCount = collectedHotels.length;
              // Keep the natural response, just add hotels
              updateMessage(messageId, { 
                content: streamingResponse || `Found ${collectedHotels.length} hotels...`,
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
                rpcSqlCode,
                similarityScores
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
    streamingMessageId.current = null;
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
