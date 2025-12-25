import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, SendHorizonal } from "lucide-react";
import { ChatMessage, Message } from "./chat-message";

interface ChatConversationViewProps {
  messages: Message[];
  message: string;
  onMessageChange: (value: string) => void;
  onSend: (content: string) => void;
  onReset: () => void;
  isLoading?: boolean;
}

export function ChatConversationView({
  messages,
  message,
  onMessageChange,
  onSend,
  onReset,
  isLoading = false,
}: ChatConversationViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8">
        <div className="max-w-[720px] mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
            <h2 className="text-lg font-semibold">Hotel Search</h2>
          </div>

          {/* Messages */}
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-border px-4 md:px-8 py-4">
        <div className="max-w-[720px] mx-auto">
          <div className="rounded-2xl border border-border bg-secondary dark:bg-card p-1">
            <div className="rounded-xl border border-border dark:border-transparent bg-card dark:bg-secondary">
              <Textarea
                placeholder={isLoading ? "Searching..." : "Continue the conversation..."}
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                disabled={isLoading}
                className="min-h-[60px] resize-none border-0 bg-transparent px-4 py-3 text-base placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !isLoading) {
                    e.preventDefault();
                    if (message.trim()) {
                      onSend(message);
                    }
                  }
                }}
              />

              <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
                <div className="text-xs text-muted-foreground">
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="size-3 animate-spin" />
                      Searching hotels...
                    </span>
                  ) : (
                    "Press Enter to send"
                  )}
                </div>

                <Button
                  size="sm"
                  onClick={() => {
                    if (message.trim() && !isLoading) {
                      onSend(message);
                    }
                  }}
                  disabled={isLoading || !message.trim()}
                  className="h-8 px-4 gap-2"
                >
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      Send
                      <SendHorizonal className="size-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

