"use client";

import { useState, useRef } from "react";
import { ChatWelcomeScreen } from "./chat-welcome-screen";
import { ChatConversationView } from "./chat-conversation-view";
import { Hotel } from "@/components/hotel/hotel-card";

interface Message {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
  hotels?: Hotel[];
  isStreaming?: boolean;
}

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

  const callHotelSearchStreaming = async (userContent: string) => {
    setIsLoading(true);
    
    // Create placeholder message for streaming
    const messageId = appendMessage("", "ai", undefined, true);
    streamingMessageId.current = messageId;
    
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
            } else if (parsed.type === "hotel") {
              // Individual hotel - merge matchScore into hotel object
              const hotelWithScore = {
                ...parsed.hotel,
                matchScore: parsed.matchScore,
                matchReason: parsed.matchReason,
              };
              collectedHotels.push(hotelWithScore);
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
              setPendingBaseQuery(null);
              updateMessage(messageId, { 
                content: parsed.message,
                hotels: hotelsWithScores,
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
