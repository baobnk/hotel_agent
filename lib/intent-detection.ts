/**
 * Intent Detection Module
 * Detects user intent from natural language queries (Vietnamese + English)
 */

export type QueryIntent = 
  | "most_expensive"      // "mắc nhất", "đắt nhất", "giá cao nhất"
  | "cheapest"            // "rẻ nhất", "giá thấp nhất"
  | "price_range"         // "khoảng $X", "around $X"
  | "normal";             // Default search

export interface IntentDetectionResult {
  intent: QueryIntent;
  confidence: number;     // 0-1
  detectedPhrases: string[]; // ["mắc nhất", "expensive"]
  location?: string;      // Extracted location if found
  priceTarget?: number;   // For "around $X" queries
}

/**
 * Detect query intent from natural language
 */
export function detectQueryIntent(query: string): IntentDetectionResult {
  const queryLower = query.toLowerCase();
  
  // Most expensive patterns (Vietnamese + English)
  const expensivePatterns = [
    /mắc\s+nhất/i,
    /đắt\s+nhất/i,
    /giá\s+cao\s+nhất/i,
    /đắt\s+tiền\s+nhất/i,
    /most\s+expensive/i,
    /highest\s+price/i,
    /priciest/i,
    /luxury/i,
    /premium/i,
    /exclusive/i
  ];
  
  // Cheapest patterns (Vietnamese + English)
  const cheapPatterns = [
    /rẻ\s+nhất/i,
    /giá\s+thấp\s+nhất/i,
    /rẻ\s+tiền\s+nhất/i,
    /cheapest/i,
    /lowest\s+price/i,
    /most\s+affordable/i,
    /budget/i
  ];
  
  // Price range patterns (Vietnamese + English)
  const priceRangePatterns = [
    /khoảng\s+\$?(\d+)/i,
    /tầm\s+\$?(\d+)/i,
    /around\s+\$?(\d+)/i,
    /about\s+\$?(\d+)/i,
    /~\$?(\d+)/i,
    /approximately\s+\$?(\d+)/i
  ];
  
  // Check for most expensive
  for (const pattern of expensivePatterns) {
    const match = queryLower.match(pattern);
    if (match) {
      return {
        intent: "most_expensive",
        confidence: 0.9,
        detectedPhrases: [match[0]],
        location: extractLocation(query)
      };
    }
  }
  
  // Check for cheapest
  for (const pattern of cheapPatterns) {
    const match = queryLower.match(pattern);
    if (match) {
      return {
        intent: "cheapest",
        confidence: 0.9,
        detectedPhrases: [match[0]],
        location: extractLocation(query)
      };
    }
  }
  
  // Check for price range
  for (const pattern of priceRangePatterns) {
    const match = queryLower.match(pattern);
    if (match) {
      const priceTarget = parseInt(match[1], 10);
      if (!isNaN(priceTarget) && priceTarget > 0) {
        return {
          intent: "price_range",
          confidence: 0.85,
          detectedPhrases: [match[0]],
          location: extractLocation(query),
          priceTarget
        };
      }
    }
  }
  
  // Default: normal search
  return {
    intent: "normal",
    confidence: 1.0,
    detectedPhrases: [],
    location: extractLocation(query)
  };
}

/**
 * Extract location from query (simple pattern matching)
 * This is a fallback - main extraction should be done by OpenAI parser
 */
function extractLocation(query: string): string | undefined {
  const queryLower = query.toLowerCase();
  
  const locations = ["melbourne", "sydney", "brisbane"];
  
  for (const location of locations) {
    if (queryLower.includes(location)) {
      // Capitalize first letter
      return location.charAt(0).toUpperCase() + location.slice(1);
    }
  }
  
  return undefined;
}


