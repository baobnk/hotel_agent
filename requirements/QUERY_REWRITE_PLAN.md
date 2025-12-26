# Plan: Query Rewrite Module với Context từ Database

## 🎯 Vấn đề hiện tại

**Query:** "tôi muốn tìm khách sạn mắc nhất ở Sydney"

**Vấn đề:**
- Parser không nhận diện được "mắc nhất" = "most expensive"
- Không có context về giá cao nhất/thấp nhất của từng location
- Kết quả trả về không đúng (không phải hotel đắt nhất)

---

## 📋 Plan chi tiết

### Phase 1: Database Statistics Module

#### 1.1. Tạo Supabase RPC để lấy statistics

```sql
-- Function: get_hotel_statistics
-- Returns: Min/Max price, tier distribution, amenities count per location
```

**Output:**
```typescript
interface LocationStatistics {
  location: string;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  tierDistribution: {
    Budget: number;
    "Mid-tier": number;
    Luxury: number;
  };
  totalHotels: number;
  commonAmenities: string[];
}
```

#### 1.2. Cache statistics (optional)
- Cache trong memory hoặc Redis
- Refresh mỗi 5-10 phút
- Giảm load DB

---

### Phase 2: Query Rewrite Module

#### 2.1. Detect query intent

**Patterns cần detect:**
- **Most expensive**: "mắc nhất", "đắt nhất", "giá cao nhất", "most expensive", "highest price"
- **Cheapest**: "rẻ nhất", "giá thấp nhất", "cheapest", "lowest price", "affordable"
- **Price range**: "khoảng $X", "around $X", "between $X and $Y"

**Implementation:**
```typescript
interface QueryIntent {
  type: "most_expensive" | "cheapest" | "price_range" | "normal";
  location?: string;
  priceTarget?: number; // For "around $X"
  minPrice?: number;
  maxPrice?: number;
}
```

#### 2.2. Rewrite query với context

**Flow:**
```
1. User query: "tôi muốn tìm khách sạn mắc nhất ở Sydney"
   ↓
2. Detect intent: "most_expensive" + location: "Sydney"
   ↓
3. Fetch statistics: Sydney maxPrice = $2000
   ↓
4. Rewrite query: "luxury hotel in Sydney with price around $2000"
   ↓
5. Update hints: { location: "Sydney", tier: "Luxury", minPrice: 1500 }
```

---

### Phase 3: Enhanced Parser

#### 3.1. Update `parseHotelQueryWithOpenAI`

**Thêm fields:**
```typescript
export type HotelSearchHints = {
  // ... existing fields
  queryIntent?: "most_expensive" | "cheapest" | "price_range" | "normal";
  priceTarget?: number; // Target price for "around $X"
  sortBy?: "price_asc" | "price_desc" | "relevance"; // Default: relevance
};
```

#### 3.2. Enhanced system prompt

**Thêm examples:**
```
- "tôi muốn tìm khách sạn mắc nhất ở Sydney" 
  → {location: "Sydney", queryIntent: "most_expensive", tier: "Luxury"}

- "cheapest hotel in Melbourne"
  → {location: "Melbourne", queryIntent: "cheapest", tier: "Budget"}

- "hotel around $200 in Brisbane"
  → {location: "Brisbane", priceTarget: 200, queryIntent: "price_range"}
```

---

### Phase 4: Search Logic Update

#### 4.1. Handle "most expensive" query

**Logic:**
```typescript
if (hints.queryIntent === "most_expensive") {
  // Get max price from statistics
  const stats = await getLocationStatistics(hints.location);
  
  // Set minPrice to 80% of maxPrice (to get top tier hotels)
  hints.minPrice = Math.floor(stats.maxPrice * 0.8);
  hints.tier = "Luxury"; // Force luxury tier
  
  // Sort by price DESC instead of relevance
  hints.sortBy = "price_desc";
}
```

#### 4.2. Handle "cheapest" query

**Logic:**
```typescript
if (hints.queryIntent === "cheapest") {
  const stats = await getLocationStatistics(hints.location);
  
  // Set maxPrice to 120% of minPrice
  hints.maxPrice = Math.ceil(stats.minPrice * 1.2);
  hints.tier = "Budget"; // Force budget tier
  
  // Sort by price ASC
  hints.sortBy = "price_asc";
}
```

#### 4.3. Update RPC function (if needed)

**Option 1:** Sort in application layer (recommended)
- RPC returns hotels
- App sorts by `price_per_night DESC/ASC`

**Option 2:** Add sort parameter to RPC
```sql
create or replace function match_hotels_hybrid(
  ...
  p_sort_by text default 'relevance' -- 'relevance' | 'price_asc' | 'price_desc'
)
```

---

### Phase 5: Additional Statistics (Bonus)

#### 5.1. Tier distribution per location

**Use case:**
- "What tier hotels are available in Sydney?"
- Show: Budget: 15, Mid-tier: 20, Luxury: 10

#### 5.2. Common amenities per location

**Use case:**
- "What amenities are common in Melbourne hotels?"
- Show: Pool: 60%, WiFi: 90%, Gym: 40%

#### 5.3. Price range suggestions

**Use case:**
- "What's a reasonable budget for Sydney?"
- Show: Budget: $50-150, Mid-tier: $150-300, Luxury: $300+

---

## 📁 File Structure

```
hotel_agent/
├── lib/
│   ├── hotel-query.ts          # Enhanced parser
│   ├── hotel-statistics.ts      # NEW: Statistics module
│   └── query-rewrite.ts         # NEW: Query rewrite module
├── app/
│   └── api/
│       └── hotel-search/
│           └── route.ts          # Updated search logic
└── data/
    └── hotel_statistics_rpc.sql # NEW: SQL function
```

---

## 🔄 Implementation Flow

```
User Query
   ↓
[Query Rewrite Module]
   ├── Detect intent (most_expensive/cheapest)
   ├── Fetch statistics from DB
   └── Rewrite query with context
   ↓
[Enhanced Parser]
   ├── Parse rewritten query
   └── Extract structured hints
   ↓
[Search Logic]
   ├── Apply price filters based on intent
   ├── Set tier if needed
   └── Sort by price (ASC/DESC)
   ↓
[Results]
```

---

## ✅ Success Criteria

1. ✅ Query "mắc nhất ở Sydney" → Returns most expensive hotels
2. ✅ Query "rẻ nhất ở Melbourne" → Returns cheapest hotels
3. ✅ Statistics được cache để giảm DB load
4. ✅ Parser nhận diện được Vietnamese + English
5. ✅ Results được sort đúng (price DESC for expensive, ASC for cheap)

---

## 🚀 Implementation Order

1. **Step 1:** Tạo SQL function `get_hotel_statistics`
2. **Step 2:** Tạo `hotel-statistics.ts` module
3. **Step 3:** Tạo `query-rewrite.ts` module
4. **Step 4:** Update `parseHotelQueryWithOpenAI` với intent detection
5. **Step 5:** Update search logic trong `route.ts`
6. **Step 6:** Test với các queries:
   - "tôi muốn tìm khách sạn mắc nhất ở Sydney"
   - "cheapest hotel in Melbourne"
   - "most expensive hotel in Brisbane"

---

## 📊 Example Statistics Output

```json
{
  "Melbourne": {
    "minPrice": 30,
    "maxPrice": 1500,
    "avgPrice": 245,
    "tierDistribution": {
      "Budget": 12,
      "Mid-tier": 15,
      "Luxury": 8
    },
    "totalHotels": 35,
    "commonAmenities": ["WiFi", "Pool", "Gym"]
  },
  "Sydney": {
    "minPrice": 40,
    "maxPrice": 2000,
    "avgPrice": 320,
    "tierDistribution": {
      "Budget": 10,
      "Mid-tier": 18,
      "Luxury": 12
    },
    "totalHotels": 40,
    "commonAmenities": ["WiFi", "Pool", "View"]
  },
  "Brisbane": {
    "minPrice": 70,
    "maxPrice": 600,
    "avgPrice": 195,
    "tierDistribution": {
      "Budget": 8,
      "Mid-tier": 20,
      "Luxury": 7
    },
    "totalHotels": 35,
    "commonAmenities": ["WiFi", "Pool"]
  }
}
```

---

## 🎯 Next Steps

Sau khi approve plan này, tôi sẽ implement theo thứ tự:
1. SQL function
2. Statistics module
3. Query rewrite module
4. Enhanced parser
5. Updated search logic
6. Testing

Bạn có muốn tôi bắt đầu implement không?

