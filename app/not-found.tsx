import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HomeIcon, SearchIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "404 - Page Not Found | Hotel Search Assistant",
  description: "The page you're looking for doesn't exist. Return to Hotel Search Assistant to find hotels in Melbourne, Sydney, or Brisbane.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* 404 Number */}
        <div className="space-y-2">
          <h1 className="text-9xl font-bold text-foreground/20">404</h1>
          <h2 className="text-3xl font-semibold text-foreground">
            Page Not Found
          </h2>
        </div>

        {/* Message */}
        <div className="space-y-2">
          <p className="text-lg text-muted-foreground">
            Sorry, we couldn't find the page you're looking for.
          </p>
          <p className="text-sm text-muted-foreground/80">
            The page might have been moved, deleted, or doesn't exist.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Button asChild size="lg" className="gap-2">
            <Link href="/">
              <HomeIcon className="size-4" />
              Go Home
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="gap-2">
            <Link href="/">
              <SearchIcon className="size-4" />
              Search Hotels
            </Link>
          </Button>
        </div>

        {/* Helpful Links */}
        <div className="pt-8 border-t border-border">
          <p className="text-sm text-muted-foreground mb-3">
            You might be looking for:
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Link
              href="/"
              className="text-sm text-primary hover:underline px-3 py-1 rounded-md hover:bg-accent transition-colors"
            >
              Home
            </Link>
            <span className="text-muted-foreground">•</span>
            <Link
              href="/"
              className="text-sm text-primary hover:underline px-3 py-1 rounded-md hover:bg-accent transition-colors"
            >
              Hotel Search
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

