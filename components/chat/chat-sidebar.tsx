"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/ui/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  UsersIcon,
  BriefcaseIcon,
  GraduationCapIcon,
  ChevronDownIcon,
  MapPinIcon,
  Building2Icon,
} from "lucide-react";

const teams = [
  { id: "personal", name: "Personal", icon: UsersIcon },
  { id: "work", name: "Work Team", icon: BriefcaseIcon },
  { id: "education", name: "Education", icon: GraduationCapIcon },
];

const cities = [
  { name: "Melbourne", icon: MapPinIcon },
  { name: "Sydney", icon: MapPinIcon },
  { name: "Brisbane", icon: MapPinIcon },
];

export function ChatSidebar() {
  const [selectedTeam, setSelectedTeam] = useState("personal");

  return (
    <div className="flex h-full w-full flex-col bg-sidebar border-r border-sidebar-border">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2.5 px-2 h-10"
            >
              <Logo className="size-6" />
              <span className="font-semibold">Hotel Agent</span>
              <ChevronDownIcon className="ml-auto size-4 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {teams.map((team) => (
              <DropdownMenuItem
                key={team.id}
                onClick={() => setSelectedTeam(team.id)}
              >
                <team.icon className="mr-2 size-4" />
                {team.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
