import { MapPin, DollarSign, Sparkles } from "lucide-react";

export type Hotel = {
  id: number;
  name: string;
  description: string;
  location: string;
  price_per_night: number;
  tier: string | null;
  amenities: string[] | null;
  similarity?: number;
  matchScore?: number;    // LLM validation score (0-100)
  matchReason?: string;   // LLM explanation
};

interface HotelCardProps {
  hotel: Hotel;
  index?: number;
  showSimilarity?: boolean;
}

// Get color based on match score (0-100)
function getMatchScoreColor(score: number) {
  if (score >= 80) return "text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30";
  if (score >= 60) return "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30";
  if (score >= 50) return "text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30";
  return "text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30";
}

// Get similarity color based on score (for vector search)
function getSimilarityColor(similarity: number) {
  // Similarity có thể âm (cosine distance), normalize về 0-1 range
  const normalized = Math.max(0, Math.min(1, (similarity + 1) / 2));
  if (normalized >= 0.6) return "text-green-600 dark:text-green-400";
  if (normalized >= 0.4) return "text-yellow-600 dark:text-yellow-400";
  return "text-orange-600 dark:text-orange-400";
}

// Format similarity as percentage
function formatSimilarity(similarity: number): string {
  // Convert cosine similarity to percentage (0-100)
  const percentage = ((similarity + 1) / 2) * 100;
  return `${percentage.toFixed(1)}%`;
}

export function HotelCard({ hotel, index, showSimilarity = true }: HotelCardProps) {
  const getTierColor = (tier: string | null) => {
    switch (tier) {
      case "Luxury":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      case "Mid-tier":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "Budget":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  return (
    <div className="border border-border rounded-lg p-4 hover:border-foreground/20 transition-colors bg-background">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {index !== undefined && (
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-semibold">
                {index}
              </span>
            )}
            <h3 className="font-semibold text-lg">{hotel.name}</h3>
            {/* LLM Match Score Badge (primary indicator) */}
            {showSimilarity && hotel.matchScore !== undefined && (
              <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${getMatchScoreColor(hotel.matchScore)}`}>
                <Sparkles className="size-3" />
                {hotel.matchScore}% match
              </span>
            )}
            {/* Vector Similarity Badge (secondary indicator) */}
            {showSimilarity && hotel.similarity !== undefined && !hotel.matchScore && (
              <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-muted ${getSimilarityColor(hotel.similarity)}`}>
                <Sparkles className="size-3" />
                {formatSimilarity(hotel.similarity)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="size-4" />
            <span>{hotel.location}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1 text-lg font-bold text-primary">
            <DollarSign className="size-5" />
            <span>{hotel.price_per_night}</span>
          </div>
          <div className="text-xs text-muted-foreground">per night</div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
        {hotel.description}
      </p>
      
      {/* LLM Match Reason */}
      {hotel.matchReason && (
        <p className="text-xs text-primary/80 mb-3 italic">
          💡 {hotel.matchReason}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {hotel.tier && (
            <span
              className={`text-xs px-2 py-1 rounded-full font-medium ${getTierColor(
                hotel.tier
              )}`}
            >
              {hotel.tier}
            </span>
          )}
          {hotel.amenities && hotel.amenities.length > 0 && (
            <>
              {hotel.amenities.slice(0, 3).map((amenity, idx) => (
                <span
                  key={idx}
                  className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground"
                >
                  {amenity}
                </span>
              ))}
              {hotel.amenities.length > 3 && (
                <span className="text-xs px-2 py-1 text-muted-foreground">
                  +{hotel.amenities.length - 3} more
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

