# Hotel Agent Test Cases (Based on Real Data)

## Overview
20 test cases designed to validate the hybrid search (SQL + Vector + BM25) functionality.

---

## Test Case 1: Basic Location Search - Melbourne
**Query:** "I need a hotel in Melbourne"

**Expected Flow:**
- Step 1: Extract → location: Melbourne
- Step 3.1: SQL Filter → `WHERE is_active = true AND location = 'Melbourne'` → 30 hotels
- Step 3.2: Vector Search → Rank by semantic similarity
- Step 3.3: BM25 → Keyword matching (minimal keywords)
- Step 3.4: Combined → 50/50 ranking

**Expected Results:** 3-5 Melbourne hotels (any tier, any price)

---

## Test Case 2: Quiet Hotel Search
**Query:** "I want a quiet, peaceful hotel in Melbourne"

**Expected Flow:**
- Step 1: Extract → location: Melbourne, keywords: [quiet, peaceful]
- Step 3.2: Vector Search → High similarity for "quiet" descriptions
- Step 3.3: BM25 → Match "quiet", "peaceful", "silence"

**Expected Top Results:**
| ID | Name | Why? |
|----|------|------|
| 1 | Melbourne Zen Garden Inn | "peaceful sanctuary", "silence policy" |
| 6 | South Yarra Quiet Stay | "quiet hidden gem", "soundproof rooms" |
| 11 | Botanical Silent Retreat | "disconnect and peace" |
| 16 | Library Loft | "Very quiet atmosphere" |

---

## Test Case 3: Budget Party Hotel
**Query:** "Cheap party hostel in Melbourne under $100"

**Expected Flow:**
- Step 1: Extract → location: Melbourne, maxPrice: 100, tier: Budget, keywords: [party, hostel]
- Step 3.1: SQL Filter → `price_per_night <= 100 AND tier = 'Budget'`

**Expected Top Results:**
| ID | Name | Price | Why? |
|----|------|-------|------|
| 3 | Fitzroy Party Hostel | $45 | "rooftop bar and nightly DJ events" |
| 8 | Brunswick Beats Hotel | $90 | "above a famous nightclub" |
| 18 | Techno Bunker | $50 | "neon lights and electronic music" |
| 13 | Backpacker Bunker | $30 | "lively common room" |

---

## Test Case 4: Family Hotel with Pool
**Query:** "Family friendly hotel in Melbourne with pool and kids activities"

**Expected Flow:**
- Step 1: Extract → location: Melbourne, keywords: [family, kids], amenities: [Pool, Kids Club]
- Step 3.3: BM25 → High score for "family", "kids", "pool"

**Expected Top Results:**
| ID | Name | Price | Why? |
|----|------|-------|------|
| 4 | St Kilda Family Resort | $320 | "Family-friendly", "water park", "playground", "Great for kids" |
| 14 | Melbourne Zoo Lodge | $350 | "Great for families" |
| 9 | Carlton Family Suites | $280 | "Safe and convenient for families" |

---

## Test Case 5: Business Hotel with WiFi
**Query:** "Business hotel in Melbourne with fast WiFi and meeting rooms"

**Expected Flow:**
- Step 1: Extract → location: Melbourne, keywords: [business, meeting], amenities: [WiFi, Meeting]

**Expected Top Results:**
| ID | Name | Price | Why? |
|----|------|-------|------|
| 2 | Melbourne CBD Executive | $250 | "business district", "High-speed fiber internet", "5 meeting rooms" |
| 7 | Docklands Tech Hub | $210 | "co-working space", "tech conferences" |
| 12 | Convention Center Hotel | $230 | "connected to the convention center", "large corporate groups" |

---

## Test Case 6: Luxury Hotel Sydney
**Query:** "Luxury hotel in Sydney with harbour view"

**Expected Flow:**
- Step 1: Extract → location: Sydney, tier: Luxury, keywords: [harbour, view]
- Step 3.1: SQL Filter → `location = 'Sydney' AND tier = 'Luxury'`

**Expected Top Results:**
| ID | Name | Price | Why? |
|----|------|-------|------|
| 31 | Sydney Harbour Quiet Suites | $400 | "Overlooking the opera house" |
| 45 | Opera House View Point | $1100 | "Unobstructed view of the sails" |
| 57 | Mosman Manor | $700 | "Harbour" amenity |
| 40 | Darling Harbour High Rise | $500 | "views of the Saturday fireworks" |

---

## Test Case 7: Budget Brisbane Under $150
**Query:** "Cheap hotel in Brisbane under $150"

**Expected Flow:**
- Step 1: Extract → location: Brisbane, maxPrice: 150, tier: Budget

**Expected Top Results (all under $150):**
| ID | Name | Price | Tier |
|----|------|-------|------|
| 73 | Caxton Street Pub Stay | $70 | Budget |
| 62 | Fortitude Valley Party | $80 | Budget |
| 81 | Spring Hill Motel | $95 | Budget |
| 86 | Sunnybank Foodie | $100 | Budget |
| 85 | Wynnum Bayside | $110 | Budget |

---

## Test Case 8: Beach Hotel Sydney
**Query:** "Hotel near the beach in Sydney for surfing"

**Expected Flow:**
- Step 1: Extract → location: Sydney, keywords: [beach, surf]

**Expected Top Results:**
| ID | Name | Price | Why? |
|----|------|-------|------|
| 34 | Bondi Beach Family | $350 | "Steps from the sand", "surfboards" |
| 51 | Cronulla Surf Lodge | $130 | "surf lodge", "surf all day" |
| 60 | Palm Beach Getaway | $900 | "northern beach" |

---

## Test Case 9: Mid-tier with Garden
**Query:** "Mid-tier hotel in Melbourne with garden, under $200"

**Expected Flow:**
- Step 1: Extract → location: Melbourne, tier: Mid-tier, maxPrice: 200, amenities: [Garden]
- Step 3.1: SQL Filter → `tier = 'Mid-tier' AND price_per_night <= 200`

**Expected Top Results:**
| ID | Name | Price | Why? |
|----|------|-------|------|
| 1 | Melbourne Zen Garden Inn | $180 | "private japanese garden" |
| 28 | Heritage Cottage | $260 | Has "Garden" - but over $200, filtered out |

**Note:** Heritage Cottage ($260) should be filtered out by price constraint.

---

## Test Case 10: Casino Hotel
**Query:** "Hotel with casino in Brisbane"

**Expected Flow:**
- Step 1: Extract → location: Brisbane, amenities: [Casino]

**Expected Top Results:**
| ID | Name | Price | Why? |
|----|------|-------|------|
| 77 | Treasury Heritage | $500 | "casino hotel", has Casino amenity |

---

## Test Case 11: Romantic/Quiet Sydney
**Query:** "Quiet romantic hotel in Sydney for honeymoon"

**Expected Flow:**
- Step 1: Extract → location: Sydney, keywords: [quiet, romantic, honeymoon]

**Expected Top Results:**
| ID | Name | Price | Why? |
|----|------|-------|------|
| 31 | Sydney Harbour Quiet Suites | $400 | "absolute silence", "Romantic" |
| 57 | Mosman Manor | $700 | "Very quiet residential area" |
| 41 | Blue Mountains Retreat | $220 | "Surrounded by eucalyptus forest", "Very quiet" |

---

## Test Case 12: No Location (Clarification Required)
**Query:** "I need a cheap hotel with pool"

**Expected Result:**
```json
{
  "type": "clarification",
  "message": "I can help you find a hotel, but first tell me which city you want: Melbourne, Sydney, or Brisbane?",
  "missingFields": ["location"]
}
```

---

## Test Case 13: Price Range Query
**Query:** "Hotels in Melbourne between $200 and $400"

**Expected Flow:**
- Step 1: Extract → location: Melbourne, minPrice: 200, maxPrice: 400
- Step 3.1: SQL Filter → `price_per_night >= 200 AND price_per_night <= 400`

**Expected Results (price range $200-$400):**
| ID | Name | Price |
|----|------|-------|
| 2 | Melbourne CBD Executive | $250 |
| 7 | Docklands Tech Hub | $210 |
| 12 | Convention Center Hotel | $230 |
| 4 | St Kilda Family Resort | $320 |
| 14 | Melbourne Zoo Lodge | $350 |
| 9 | Carlton Family Suites | $280 |
| 28 | Heritage Cottage | $260 |
| 30 | River View Apartments | $310 |

---

## Test Case 14: Art/Bohemian Hotel
**Query:** "Artsy bohemian hotel in Melbourne"

**Expected Flow:**
- Step 1: Extract → location: Melbourne, keywords: [artsy, bohemian, art]

**Expected Top Results:**
| ID | Name | Price | Why? |
|----|------|-------|------|
| 21 | Northcote Artsy Inn | $140 | "Bohemian style", "local art" |

---

## Test Case 15: Tech/Digital Nomad
**Query:** "Hotel for digital nomads in Melbourne with co-working space"

**Expected Flow:**
- Step 1: Extract → location: Melbourne, keywords: [digital nomad, co-working, tech]

**Expected Top Results:**
| ID | Name | Price | Why? |
|----|------|-------|------|
| 7 | Docklands Tech Hub | $210 | "co-working space", "Ideal for digital nomads" |
| 17 | Start-up Stay | $120 | "whiteboards", "young entrepreneurs" |
| 2 | Melbourne CBD Executive | $250 | "High-speed fiber internet" |

---

## Test Case 16: Zoo/Animal Experience
**Query:** "Hotel where I can see animals in Sydney"

**Expected Flow:**
- Step 1: Extract → location: Sydney, keywords: [animals, zoo]

**Expected Top Results:**
| ID | Name | Price | Why? |
|----|------|-------|------|
| 44 | Taronga Zoo Glamping | $600 | "inside the zoo", "Wake up to giraffes" |

---

## Test Case 17: Very Cheap (Under $50)
**Query:** "Cheapest hotel in Melbourne, I have very low budget"

**Expected Flow:**
- Step 1: Extract → location: Melbourne, maxPrice: 50, tier: Budget

**Expected Top Results:**
| ID | Name | Price | Why? |
|----|------|-------|------|
| 13 | Backpacker Bunker | $30 | "Cheapest beds in town" |
| 3 | Fitzroy Party Hostel | $45 | Budget hostel |
| 18 | Techno Bunker | $50 | Budget option |

---

## Test Case 18: Food/Culinary Experience
**Query:** "Hotel near good food and restaurants in Brisbane"

**Expected Flow:**
- Step 1: Extract → location: Brisbane, keywords: [food, restaurants, dining]

**Expected Top Results:**
| ID | Name | Price | Why? |
|----|------|-------|------|
| 86 | Sunnybank Foodie | $100 | "Hub of asian cuisine", "tasty" |
| 64 | Eagle Street Pier Biz | $300 | "near top restaurants", "Dining" amenity |
| 67 | West End Indie | $120 | "craft breweries" |

---

## Test Case 19: Sports/Stadium
**Query:** "Hotel near stadium or sports venue in Brisbane"

**Expected Flow:**
- Step 1: Extract → location: Brisbane, keywords: [stadium, sports, cricket]

**Expected Top Results:**
| ID | Name | Price | Why? |
|----|------|-------|------|
| 72 | Gabba Sports Hotel | $150 | "Across from the stadium", Cricket + AFL amenities |
| 82 | Ascot Racecourse | $250 | "race tracks", Horse amenity |

---

## Test Case 20: Inactive Hotels Should NOT Appear
**Query:** "Cheapest hotel in Melbourne"

**Expected Validation:**
- Hotels with `is_active = false` should NEVER appear in results
- Ghost Hotel 1 (ID: 91, $10) - MUST NOT appear
- Hidden Luxury Trap (ID: 94, $50) - MUST NOT appear
- Inactive Gem (ID: 96, $100) - MUST NOT appear
- System Test Record (ID: 99, $100) - MUST NOT appear

**Expected Results:** Only active hotels (IDs 1-90)

---

## Summary Matrix

| TC | Location | Price | Tier | Keywords | Expected Count |
|----|----------|-------|------|----------|----------------|
| 1 | Melbourne | Any | Any | - | 3-5 |
| 2 | Melbourne | Any | Any | quiet, peaceful | 3-5 |
| 3 | Melbourne | ≤$100 | Budget | party, hostel | 3-5 |
| 4 | Melbourne | Any | Any | family, kids, pool | 3-5 |
| 5 | Melbourne | Any | Any | business, WiFi, meeting | 3-5 |
| 6 | Sydney | Any | Luxury | harbour, view | 3-5 |
| 7 | Brisbane | ≤$150 | Budget | cheap | 3-5 |
| 8 | Sydney | Any | Any | beach, surf | 3-5 |
| 9 | Melbourne | ≤$200 | Mid-tier | garden | 3-5 |
| 10 | Brisbane | Any | Any | casino | 1-3 |
| 11 | Sydney | Any | Any | quiet, romantic | 3-5 |
| 12 | ❌ None | Any | Any | pool | Clarification |
| 13 | Melbourne | $200-$400 | Any | - | 3-5 |
| 14 | Melbourne | Any | Any | artsy, bohemian | 1-3 |
| 15 | Melbourne | Any | Any | digital nomad, co-working | 3-5 |
| 16 | Sydney | Any | Any | animals, zoo | 1-3 |
| 17 | Melbourne | ≤$50 | Budget | cheap | 3 |
| 18 | Brisbane | Any | Any | food, restaurants | 3-5 |
| 19 | Brisbane | Any | Any | stadium, sports | 2-3 |
| 20 | Melbourne | Any | Any | cheap | 3-5 (NO inactive) |

---

## Security Checks (All Test Cases)

### Check 1: Inactive Hotels
**Query:** Any query above

**Validation:**
- Response must NOT include hotels with IDs: 91, 92, 93, 94, 95, 96, 97, 98, 99, 100
- These hotels have `is_active = false`

### Check 2: Sensitive Data
**Query:** Any query above

**Validation:**
- Response must NOT include `internal_commission_rate` field
- Check network response in browser DevTools

---

## Scoring Verification

For each test case, verify the hybrid scoring:

```
Combined Score = (Vector Score × 0.5) + (BM25 Score × 0.5)

Where:
- Vector Score = (similarity + 1) / 2  (normalized 0-1)
- BM25 Score = keyword matching score (0-1)
```

### Example: Test Case 2 (Quiet Melbourne)

| Hotel | Vector Score | BM25 Score | Combined |
|-------|--------------|------------|----------|
| Melbourne Zen Garden Inn | 85% | 90% | 87.5% |
| South Yarra Quiet Stay | 82% | 95% | 88.5% |
| Botanical Silent Retreat | 80% | 75% | 77.5% |

The hotel with highest combined score should be ranked #1.

---

## Running Tests

### Manual Testing
1. Start dev server: `npm run dev`
2. Open `localhost:3000`
3. Enter each query
4. Verify:
   - Correct hotels returned
   - No inactive hotels
   - No `internal_commission_rate`
   - Click "View Reasoning Flow" to see hybrid search details

### Automated Testing (Optional)
```bash
# Run API tests
npm test

# Run specific test case
curl -X POST http://localhost:3000/api/hotel-search \
  -H "Content-Type: application/json" \
  -d '{"message": "quiet hotel in Melbourne", "stream": false}'
```

