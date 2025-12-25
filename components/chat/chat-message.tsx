import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HotelCard, Hotel } from "@/components/hotel/hotel-card";
import { Loader2 } from "lucide-react";

interface Message {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
  hotels?: Hotel[];
  isStreaming?: boolean;
}

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const hasHotels = message.hotels && message.hotels.length > 0;

  return (
    <div
      className={cn(
        "flex gap-4",
        message.sender === "user" ? "justify-end" : "justify-start"
      )}
    >
      {message.sender === "ai" && (
        <div className="shrink-0">
          <div className="size-8 rounded-full bg-secondary flex items-center justify-center">
            {message.isStreaming ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <Logo className="size-6" />
            )}
          </div>
        </div>
      )}

      <div
        className={cn(
          "flex flex-col gap-3",
          message.sender === "user" ? "max-w-[80%]" : "max-w-[95%] w-full"
        )}
      >
        {/* Text content */}
        {message.content && (
          <div
            className={cn(
              "rounded-2xl px-4 py-3",
              message.sender === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary"
            )}
          >
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
              {message.isStreaming && (
                <span className="inline-block ml-1 animate-pulse">▊</span>
              )}
            </p>
          </div>
        )}

        {/* Hotels list - sorted by similarity (already sorted from API) */}
        {hasHotels && message.hotels && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-muted-foreground">
                📊 Sorted by relevance (highest match first)
              </span>
              <span className="text-xs font-medium text-primary">
                {message.hotels.length} {message.hotels.length === 1 ? 'result' : 'results'}
              </span>
            </div>
            {message.hotels.map((hotel, index) => (
              <HotelCard 
                key={hotel.id} 
                hotel={hotel} 
                index={index + 1}
                showSimilarity={true}
              />
            ))}
          </div>
        )}
      </div>

      {message.sender === "user" && (
        <div className="shrink-0">
          <Avatar className="size-8">
            <AvatarImage src="/ln.png" alt="User" />
            <AvatarFallback>U</AvatarFallback>
          </Avatar>
        </div>
      )}
    </div>
  );
}

