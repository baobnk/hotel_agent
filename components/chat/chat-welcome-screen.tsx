import { Logo } from "@/components/ui/logo";
import { ChatInputBox } from "./chat-input-box";

interface ChatWelcomeScreenProps {
  message: string;
  onMessageChange: (value: string) => void;
  onSend: () => void;
}

export function ChatWelcomeScreen({
  message,
  onMessageChange,
  onSend,
}: ChatWelcomeScreenProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 md:px-8">
      <div className="w-full max-w-[640px] space-y-9 -mt-12">
        <div className="flex justify-center">
          <div className="flex items-center justify-center size-8 rounded-full">
            <Logo className="size-20" />
          </div>
        </div>

        <div className="space-y-4 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Hotel Search Assistant
          </h1>
          <p className="text-lg text-muted-foreground">
            Tell me what kind of hotel you&apos;re looking for. I can search in Melbourne, Sydney, or Brisbane.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>Try: &quot;I need a quiet place in Melbourne under $200&quot;</span>
          </div>
        </div>

        <ChatInputBox
          message={message}
          onMessageChange={onMessageChange}
          onSend={onSend}
        />
      </div>

      <div className="absolute bottom-6 text-center">
        <p className="text-sm text-muted-foreground">
          Powered by OpenAI text-embedding-3-small & Supabase
        </p>
      </div>
    </div>
  );
}

