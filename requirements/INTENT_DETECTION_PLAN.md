# Plan: Intent Detection & Statistics Module (Using JSON)

## 🎯 Vấn đề

**Query:** "tôi muốn tìm khách sạn mắc nhất ở Sydney"

**Vấn đề hiện tại:**
- Parser không nhận diện được "mắc nhất" = "most expensive"
- Không có context về giá min/max từ database
- Kết quả không đúng (không phải hotel đắt nhất)

---

## 📊 Data Source: `hotel_statistics.json`

File đã có sẵn các thông tin:
```json
{
  "prices": {
    "by_location": {
      "Melbourne": { "min": 10, "max": 1500, "avg": 292.06 },
      "Sydney": { "min": 0, "max": 2000, "avg": 401.91 },
      "Brisbane": { "min": 10, "max": 600, "avg": 203.59 }
    },
    "by_tier": {
      "Budget": { "min": 0, "max": 1000, "avg": 113.28 },
      "Mid-tier": { "min": 100, "max": 300, "avg": 205.44 },
      "Luxury": { "min": 50, "max": 2000, "avg": 676.15 }
    }
  },
  "tier_analysis": {
    "recommendation": {
      "Budget": { "min": 0, "max": 150, "typical": "$30 - $140" },
      "Mid-tier": { "min": 150, "max": 400, "typical": "$150 - $300" },
      "Luxury": { "min": 300, "max": Infinity, "typical": "$300+" }
    }
  }
}
```

---

## 📋 Plan chi tiết

### Phase 1: Intent Detection Module

#### 1.1. Tạo `lib/intent-detection.ts`

**Detect các intent types:**
```typescript
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
}
```

**Patterns to detect:**

| Intent | Vietnamese | English | Examples |
|--------|-----------|---------|----------|
| `most_expensive` | mắc nhất, đắt nhất, giá cao nhất, đắt tiền nhất | most expensive, highest price, priciest, luxury | "mắc nhất ở Sydney", "most expensive hotel" |
| `cheapest` | rẻ nhất, giá thấp nhất, rẻ tiền nhất | cheapest, lowest price, most affordable | "rẻ nhất ở Melbourne", "cheapest hotel" |
| `price_range` | khoảng $X, tầm $X, around $X | around $X, about $X, ~$X | "khoảng $200", "around $300" |
| `normal` | (default) | (default) | "quiet hotel", "family hotel" |

**Implementation:**
```typescript
export function detectQueryIntent(query: string): IntentDetectionResult {
  const queryLower = query.toLowerCase();
  
  // Most expensive patterns
  const expensivePatterns = [
    /mắc\s+nhất/i,
    /đắt\s+nhất/i,
    /giá\s+cao\s+nhất/i,
    /đắt\s+tiền\s+nhất/i,
    /most\s+expensive/i,
    /highest\s+price/i,
    /priciest/i,
    /luxury/i
  ];
  
  // Cheapest patterns
  const cheapPatterns = [
    /rẻ\s+nhất/i,
    /giá\s+thấp\s+nhất/i,
    /rẻ\s+tiền\s+nhất/i,
    /cheapest/i,
    /lowest\s+price/i,
    /most\s+affordable/i
  ];
  
  // Price range patterns
  const priceRangePatterns = [
    /khoảng\s+\$?(\d+)/i,
    /tầm\s+\$?(\d+)/i,
    /around\s+\$?(\d+)/i,
    /about\s+\$?(\d+)/i,
    /~\$?(\d+)/i
  ];
  
  // Check patterns
  for (const pattern of expensivePatterns) {
    if (pattern.test(query)) {
      return {
        intent: "most_expensive",
        confidence: 0.9,
        detectedPhrases: [query.match(pattern)?.[0] || ""]
      };
    }
  }
  
  // ... similar for cheapest and price_range
  
  return { intent: "normal", confidence: 1.0, detectedPhrases: [] };
}
```

---

### Phase 2: Statistics Module (JSON-based)

#### 2.1. Tạo `lib/hotel-statistics.ts`

**Load statistics từ JSON file:**
```typescript
import hotelStatistics from "@/data/hotel_statistics.json";

export interface LocationStatistics {
  location: string;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  medianPrice: number;
  totalHotels: number;
}

export interface TierStatistics {
  tier: "Budget" | "Mid-tier" | "Luxury";
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  medianPrice: number;
  count: number;
  recommendedRange: {
    min: number;
    max: number;
    typical: string;
  };
}

export function getLocationStatistics(location: string): LocationStatistics | null {
  const stats = hotelStatistics.prices.by_location[location as keyof typeof hotelStatistics.prices.by_location];
  if (!stats) return null;
  
  return {
    location,
    minPrice: stats.min,
    maxPrice: stats.max,
    avgPrice: stats.avg,
    medianPrice: stats.median,
    totalHotels: stats.count
  };
}

export function getTierStatistics(tier: "Budget" | "Mid-tier" | "Luxury"): TierStatistics | null {
  const stats = hotelStatistics.prices.by_tier[tier];
  const recommendation = hotelStatistics.tier_analysis.recommendation[tier];
  
  if (!stats || !recommendation) return null;
  
  return {
    tier,
    minPrice: stats.min,
    maxPrice: stats.max,
    avgPrice: stats.avg,
    medianPrice: stats.median,
    count: stats.count,
    recommendedRange: {
      min: recommendation.min,
      max: recommendation.max === Infinity ? 9999 : recommendation.max,
      typical: recommendation.typical
    }
  };
}

export function getAllLocations(): string[] {
  return hotelStatistics.locations.unique_locations;
}
```

---

### Phase 3: Enhanced Parser với Intent

#### 3.1. Update `lib/hotel-query.ts`

**Thêm intent vào `HotelSearchHints`:**
```typescript
export type HotelSearchHints = {
  location?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  keywords?: string[] | null;
  name?: string | null;
  tier?: "Budget" | "Mid-tier" | "Luxury" | null;
  amenities?: string[] | null;
  price?: number | null;
  
  // NEW: Intent fields
  queryIntent?: QueryIntent;
  sortBy?: "price_asc" | "price_desc" | "relevance";
  priceTarget?: number; // For "around $X" queries
};
```

**Update `parseHotelQueryWithOpenAI`:**
```typescript
export async function parseHotelQueryWithOpenAI(
  userMessage: string
): Promise<HotelSearchHints> {
  // Step 1: Detect intent FIRST
  const intentResult = detectQueryIntent(userMessage);
  
  // Step 2: Parse with OpenAI (existing logic)
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      { 
        role: "system", 
        content: `
You are a parser that extracts hotel search parameters from natural language.
Always respond with pure JSON only, no extra text.

Fields to extract:
- location: city name (Melbourne, Sydney, or Brisbane) if specified, otherwise null
- minPrice: integer minimum price per night in AUD if specified, otherwise null
- maxPrice: integer maximum price per night in AUD if specified, otherwise null
- price: exact price if user specifies a specific price, otherwise null
- tier: tier name if specified ("Budget", "Mid-tier", or "Luxury"), otherwise null
- keywords: array of lowercased descriptive keywords

IMPORTANT: If user asks for "most expensive" or "cheapest", you should still extract location and keywords, but leave price fields as null (they will be set by intent logic).

Examples:
- "tôi muốn tìm khách sạn mắc nhất ở Sydney" 
  → {location: "Sydney", keywords: ["luxury", "expensive"], tier: null, minPrice: null, maxPrice: null}
- "cheapest hotel in Melbourne"
  → {location: "Melbourne", keywords: ["cheap", "budget"], tier: null, minPrice: null, maxPrice: null}
        `
      },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
  });
  
  // ... existing parsing logic ...
  
  // Step 3: Apply intent-based logic
  const hints: HotelSearchHints = {
    // ... existing fields ...
    queryIntent: intentResult.intent,
    sortBy: intentResult.intent === "most_expensive" ? "price_desc" 
         : intentResult.intent === "cheapest" ? "price_asc"
         : "relevance"
  };
  
  // Step 4: If intent is most_expensive or cheapest, get statistics and set price filters
  if (intentResult.intent === "most_expensive" && hints.location) {
    const locationStats = getLocationStatistics(hints.location);
    if (locationStats) {
      // Set minPrice to 80% of maxPrice to get top tier hotels
      hints.minPrice = Math.floor(locationStats.maxPrice * 0.8);
      hints.tier = "Luxury"; // Force luxury tier
    }
  } else if (intentResult.intent === "cheapest" && hints.location) {
    const locationStats = getLocationStatistics(hints.location);
    if (locationStats) {
      // Set maxPrice to 120% of minPrice
      hints.maxPrice = Math.ceil(locationStats.minPrice * 1.2);
      hints.tier = "Budget"; // Force budget tier
    }
  } else if (intentResult.intent === "price_range" && intentResult.priceTarget) {
    // For "around $X" queries, set range ±20%
    hints.minPrice = Math.floor(intentResult.priceTarget * 0.8);
    hints.maxPrice = Math.ceil(intentResult.priceTarget * 1.2);
  }
  
  return hints;
}
```

---

### Phase 4: Update Search Logic

#### 4.1. Update `app/api/hotel-search/route.ts`

**Handle intent-based sorting:**
```typescript
async function* streamHotelSearch(userMessage: string): AsyncGenerator<string> {
  // ... existing parsing ...
  
  const hints: HotelSearchHints = await parseHotelQueryWithOpenAI(userMessage);
  
  // ... existing search logic ...
  
  // After getting hotels from RPC:
  let hotels: HotelSearchResult[] = rawData.map(...);
  
  // Apply intent-based sorting
  if (hints.sortBy === "price_desc") {
    // Sort by price DESC for most expensive
    hotels.sort((a, b) => b.price_per_night - a.price_per_night);
  } else if (hints.sortBy === "price_asc") {
    // Sort by price ASC for cheapest
    hotels.sort((a, b) => a.price_per_night - b.price_per_night);
  }
  // else: keep relevance sorting (vector + BM25)
  
  // ... rest of logic ...
}
```

---

## 📁 File Structure

```
hotel_agent/
├── lib/
│   ├── intent-detection.ts      # NEW: Intent detection
│   ├── hotel-statistics.ts       # NEW: Statistics from JSON
│   └── hotel-query.ts            # UPDATED: Enhanced parser
├── app/
│   └── api/
│       └── hotel-search/
│           └── route.ts          # UPDATED: Handle intent sorting
└── data/
    └── hotel_statistics.json      # EXISTING: Statistics data
```

---

## 🔄 Implementation Flow

```
User Query: "tôi muốn tìm khách sạn mắc nhất ở Sydney"
   ↓
[Intent Detection]
   ├── Detect: "most_expensive"
   └── Confidence: 0.9
   ↓
[Enhanced Parser]
   ├── Parse: {location: "Sydney", keywords: ["luxury"]}
   ├── Get stats: Sydney maxPrice = $2000
   └── Apply intent: {minPrice: 1600, tier: "Luxury", sortBy: "price_desc"}
   ↓
[Search Logic]
   ├── RPC call with filters
   ├── Sort by price DESC
   └── Return: Top 3-5 most expensive hotels
```

---

## ✅ Success Criteria

1. ✅ Query "mắc nhất ở Sydney" → Returns most expensive hotels (sorted by price DESC)
2. ✅ Query "rẻ nhất ở Melbourne" → Returns cheapest hotels (sorted by price ASC)
3. ✅ Query "khoảng $200 ở Brisbane" → Returns hotels around $200 (±20%)
4. ✅ Statistics loaded from JSON (no SQL needed)
5. ✅ Intent detection works for Vietnamese + English

---

## 🚀 Implementation Order

1. **Step 1:** Tạo `lib/intent-detection.ts`
2. **Step 2:** Tạo `lib/hotel-statistics.ts`
3. **Step 3:** Update `lib/hotel-query.ts` với intent detection
4. **Step 4:** Update `app/api/hotel-search/route.ts` với intent-based sorting
5. **Step 5:** Test với các queries:
   - "tôi muốn tìm khách sạn mắc nhất ở Sydney"
   - "cheapest hotel in Melbourne"
   - "rẻ nhất ở Brisbane"

---

## 📊 Example Statistics Usage

**For "most expensive in Sydney":**
```typescript
const stats = getLocationStatistics("Sydney");
// stats = { minPrice: 0, maxPrice: 2000, avgPrice: 401.91, ... }

// Set minPrice to 80% of maxPrice
hints.minPrice = Math.floor(2000 * 0.8); // = 1600
hints.tier = "Luxury";
hints.sortBy = "price_desc";
```

**For "cheapest in Melbourne":**
```typescript
const stats = getLocationStatistics("Melbourne");
// stats = { minPrice: 10, maxPrice: 1500, avgPrice: 292.06, ... }

// Set maxPrice to 120% of minPrice (but use active hotels min = 30)
hints.maxPrice = Math.ceil(30 * 1.2); // = 36
hints.tier = "Budget";
hints.sortBy = "price_asc";
```

---

## 🎯 Next Steps

Sau khi approve plan này, tôi sẽ implement theo thứ tự:
1. Intent detection module
2. Statistics module (JSON-based)
3. Enhanced parser
4. Updated search logic
5. Testing

Bạn có muốn tôi bắt đầu implement không?


