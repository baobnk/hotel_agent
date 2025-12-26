"use client";

import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/ui/logo";
import {
  MapPinIcon,
  Building2Icon,
} from "lucide-react";

const cities = [
  { name: "Melbourne", icon: MapPinIcon },
  { name: "Sydney", icon: MapPinIcon },
  { name: "Brisbane", icon: MapPinIcon },
];

export function ChatSidebar() {
  return (
    <div className="flex h-full w-full flex-col bg-sidebar border-r border-sidebar-border">
      {/* Header */}
      <div className="flex items-center gap-2.5 p-3 border-b border-sidebar-border">
        <Logo className="size-6" />
        <span className="font-semibold">Hotel Agent</span>
      </div>

      <Separator />

      {/* Cities Section */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Available Cities
        </div>
        <div className="space-y-1">
          {cities.map((city) => (
            <div
              key={city.name}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors"
            >
              <city.icon className="size-4 text-muted-foreground" />
              <span className="text-sm">{city.name}</span>
            </div>
          ))}
        </div>

        <Separator className="my-4" />

        {/* Quick Tips */}
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Quick Tips
        </div>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>• Describe what you&apos;re looking for</p>
          <p>• Mention your preferred city</p>
          <p>• Include budget if needed</p>
          <p>• Try: &quot;quiet hotel in Sydney&quot;</p>
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Building2Icon className="size-4" />
          <span>100 Hotels Available</span>
        </div>
      </div>
    </div>
  );
}
