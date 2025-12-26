"use client";

import { useState } from "react";
import { X, ChevronDown, ChevronRight, CheckCircle2, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface ReasoningStep {
  id: string;
  title: string;
  icon: string;
  description: string;
  details?: {
    input?: string;
    output?: string;
    reasoning?: string;
    data?: Record<string, any>;
  };
}

export interface ReasoningFlowData {
  query: string;
  steps: ReasoningStep[];
  totalTime?: string;
}

interface ReasoningFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ReasoningFlowData;
}

function StepCard({ step, index, isLast }: { step: ReasoningStep; index: number; isLast: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="relative">
      {/* Connecting line */}
      {!isLast && (
        <div className="absolute left-[19px] top-10 bottom-0 w-0.5 bg-border" />
      )}
      
      <div className="flex gap-4">
        {/* Step number */}
        <div className="shrink-0 size-10 rounded-full bg-primary/10 flex items-center justify-center text-lg z-10">
          {step.icon}
        </div>

        {/* Content */}
        <div className="flex-1 pb-6">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 w-full text-left group"
          >
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
              {step.title}
            </h3>
            {step.details && (
              isExpanded ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )
            )}
          </button>
          
          <p className="text-sm text-muted-foreground mt-1">
            {step.description}
          </p>

          {/* Expandable details */}
          {isExpanded && step.details && (
            <div className="mt-3 p-4 rounded-lg bg-muted/50 border border-border/50 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
              {step.details.input && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Input</span>
                  <p className="text-sm mt-1">{step.details.input}</p>
                </div>
              )}
              
              {step.details.reasoning && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">💡 Reasoning</span>
                  <p className="text-sm mt-1 text-foreground/80">{step.details.reasoning}</p>
                </div>
              )}
              
              {step.details.output && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Output</span>
                  <p className="text-sm mt-1">{step.details.output}</p>
                </div>
              )}

              {step.details.data && Object.keys(step.details.data).length > 0 && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Data</span>
                  <div className="mt-2 space-y-3">
                    {Object.entries(step.details.data).map(([key, value]) => {
                      // Special handling for SQL RPC Code
                      if (key === "SQL RPC Code" && typeof value === "string") {
                        return (
                          <div key={key} className="space-y-1">
                            <span className="text-xs font-medium text-muted-foreground">{key}:</span>
                            <pre className="text-xs bg-background border border-border rounded p-2 overflow-x-auto font-mono">
                              {value}
                            </pre>
                          </div>
                        );
                      }
                      
                      // Special handling for Top Results
                      if (key === "Top 5 Results (by Similarity Score)" && typeof value === "string") {
                        return (
                          <div key={key} className="space-y-1">
                            <span className="text-xs font-medium text-muted-foreground">{key}:</span>
                            <div className="text-sm space-y-1.5 mt-2">
                              {value.split("; ").map((item, idx) => (
                                <div key={idx} className="pl-3 py-1.5 border-l-2 border-primary/30 bg-muted/30 rounded-r">
                                  <span className="font-medium text-primary/80">{item}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      
                      // Default rendering
                      return (
                        <div key={key} className="text-sm">
                          <span className="text-muted-foreground">{key}: </span>
                          <span className="font-medium">
                            {Array.isArray(value) ? value.join(", ") || "None" : String(value)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Checkmark */}
        <div className="shrink-0">
          <CheckCircle2 className="size-5 text-green-500" />
        </div>
      </div>
    </div>
  );
}

export function ReasoningFlowModal({ isOpen, onClose, data }: ReasoningFlowModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-background border border-border rounded-xl shadow-lg w-full max-w-2xl max-h-[80vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Brain className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">AI Reasoning Flow</h2>
              <p className="text-xs text-muted-foreground">How AI processed your query</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </div>

        {/* Query */}
        <div className="p-4 bg-muted/30 border-b border-border">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your Query</span>
          <p className="text-sm mt-1 font-medium">"{data.query}"</p>
        </div>

        {/* Steps */}
        <div className="p-4 overflow-y-auto max-h-[50vh]">
          {data.steps.map((step, index) => (
            <StepCard 
              key={step.id} 
              step={step} 
              index={index}
              isLast={index === data.steps.length - 1}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-muted/30">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {data.steps.length} steps completed
            </span>
            {data.totalTime && (
              <span className="text-muted-foreground">
                Total time: {data.totalTime}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Button to trigger the modal
interface ViewReasoningButtonProps {
  onClick: () => void;
}

export function ViewReasoningButton({ onClick }: ViewReasoningButtonProps) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-md hover:bg-muted"
    >
      <Brain className="size-3.5" />
      <span>View Reasoning Flow</span>
    </button>
  );
}

export default ReasoningFlowModal;

