# Test Cases - Hotel Search POC

## 📋 Test Cases Overview

10 test cases để validate toàn bộ functionality của Hotel Search system.

---

## Test Case 1: Clarification - Missing Location ✅

**Query:**
```
I need a hotel under $200
```

**Expected Behavior:**
- ✅ System hỏi clarification về location
- ✅ Response type: `"clarification"`
- ✅ Message: "I can help you find a hotel, but first tell me which city you want: Melbourne, Sydney, or Brisbane?"
- ✅ `missingFields`: `["location"]`
- ✅ `partialHints`: `{ maxPrice: 200 }`

**Follow-up:**
```
Melbourne
```

**Expected Result:**
- ✅ Combine queries: "I need a hotel under $200 Melbourne"
- ✅ Return hotels ở Melbourne với price <= $200
- ✅ Response type: `"results"`

---

## Test Case 2: Full Query with Location ✅

**Query:**
```
I need a quiet place in Melbourne under $200
```

**Expected Behavior:**
- ✅ Parse thành: `{ location: "Melbourne", maxPrice: 200, keywords: ["quiet"] }`
- ✅ Generate embedding từ full query
- ✅ Call RPC với: `p_location: "Melbourne"`, `p_max_price: 200`
- ✅ Return hotels có:
  - Location = Melbourne
  - Price <= $200
  - High similarity với "quiet" (semantic matching)
- ✅ **KHÔNG có inactive hotels** (IDs 91-100)
- ✅ **KHÔNG có** `is_active` hoặc `internal_commission_rate` trong response

**Expected Hotels:**
- Melbourne Zen Garden Inn ($180) - High similarity với "quiet"
- South Yarra Quiet Stay ($190)
- Botanical Silent Retreat ($175)
- Library Loft ($160)

---

## Test Case 3: Semantic Matching - "Peaceful" → "Quiet" ✅

**Query:**
```
Find me a peaceful hotel in Sydney
```

**Expected Behavior:**
- ✅ Parse: `{ location: "Sydney", keywords: ["peaceful"] }`
- ✅ Vector search tìm hotels với descriptions: "quiet", "tranquil", "serene", "silent"
- ✅ Return hotels có high similarity với "peaceful"

**Expected Hotels:**
- Sydney Harbour Quiet Suites ($400) - "absolute silence"
- Blue Mountains Retreat ($220) - "Very quiet"
- Mosman Manor ($700) - "Very quiet residential area"

**Validation:**
- ✅ Similarity scores > 0 (hoặc close to 0 for cosine distance)
- ✅ Hotels có descriptions match semantic của "peaceful"

---

## Test Case 4: Family-Friendly Search ✅

**Query:**
```
I need a family hotel with pool for kids in Brisbane
```

**Expected Behavior:**
- ✅ Parse: `{ location: "Brisbane", keywords: ["family", "pool", "kids"] }`
- ✅ Vector search tìm hotels với "family-friendly", "kids", "children", "pool"
- ✅ Return hotels có amenities: Pool, Kids Club, Family

**Expected Hotels:**
- South Bank Family ($260) - "Perfect for kids swimming"
- Tangalooma Island Resort ($350) - "Feed dolphins" (family-friendly)

**Validation:**
- ✅ Hotels có "family" hoặc "kids" trong description
- ✅ Amenities có Pool hoặc Kids Club

---

## Test Case 5: Luxury Hotel Search ✅

**Query:**
```
Show me luxury hotels in Melbourne
```

**Expected Behavior:**
- ✅ Parse: `{ location: "Melbourne", keywords: ["luxury"] }`
- ✅ Return hotels với `tier: "Luxury"`
- ✅ High similarity với "luxury" descriptions

**Expected Hotels:**
- Collins Street Luxury ($800)
- Langham Royal Suite ($1200)
- Crown Tower Penthouse ($1500)
- Grand Victorian ($600)

**Validation:**
- ✅ All hotels có `tier: "Luxury"`
- ✅ Price range: $600-$1500
- ✅ Descriptions mention "luxury", "opulent", "exclusive"

---

## Test Case 6: Budget Hotel Search ✅

**Query:**
```
I want a cheap hotel in Sydney under $100
```

**Expected Behavior:**
- ✅ Parse: `{ location: "Sydney", maxPrice: 100, keywords: ["cheap"] }`
- ✅ Return hotels với:
  - Location = Sydney
  - Price <= $100
  - Tier = "Budget" (hoặc low price)

**Expected Hotels:**
- Backpacker Bunker ($30) - Nếu có trong Sydney
- Newtown Indie Hostel ($55)
- Coogee Beach Hostel ($40)
- Glebe Boheme ($90)

**Validation:**
- ✅ All prices <= $100
- ✅ Location = Sydney
- ✅ **KHÔNG có inactive hotels**

---

## Test Case 7: Business Hotel Search ✅

**Query:**
```
I need a business hotel in Melbourne with WiFi and meeting rooms
```

**Expected Behavior:**
- ✅ Parse: `{ location: "Melbourne", keywords: ["business", "wifi", "meeting"] }`
- ✅ Vector search tìm hotels với "business", "corporate", "meeting", "WiFi"
- ✅ Return hotels có amenities: WiFi, Desk, Meeting

**Expected Hotels:**
- Melbourne CBD Executive ($250) - "High-speed fiber internet, ergonomic chairs, and 5 meeting rooms"
- Convention Center Hotel ($230) - "tailored for large corporate groups"
- Docklands Tech Hub ($210) - "Ideal for digital nomads and tech conferences"

**Validation:**
- ✅ Hotels có "business" hoặc "corporate" trong description
- ✅ Amenities có WiFi, Desk, hoặc Meeting

---

## Test Case 8: Price Range Filter ✅

**Query:**
```
Find hotels in Brisbane between $200 and $400
```

**Expected Behavior:**
- ✅ Parse: `{ location: "Brisbane", minPrice: 200, maxPrice: 400 }`
- ✅ Call RPC với: `p_min_price: 200`, `p_max_price: 400`
- ✅ Return hotels với price trong range $200-$400

**Expected Hotels:**
- South Bank Family ($260)
- Powerhouse Arts Hotel ($220)
- Mt Coot-tha Retreat ($200)
- Indooroopilly Shop ($190) - Nếu minPrice không strict
- Tangalooma Island Resort ($350)

**Validation:**
- ✅ All prices >= $200 và <= $400
- ✅ Location = Brisbane

---

## Test Case 9: Edge Case - No Results ✅

**Query:**
```
I need a luxury hotel in Melbourne under $50
```

**Expected Behavior:**
- ✅ Parse: `{ location: "Melbourne", maxPrice: 50, keywords: ["luxury"] }`
- ✅ Call RPC với: `p_location: "Melbourne"`, `p_max_price: 50`
- ✅ Return empty array hoặc very few results
- ✅ Message: "I could not find any hotels that match your request."

**Validation:**
- ✅ Response type: `"results"`
- ✅ `hotels`: `[]` hoặc empty
- ✅ Message indicates no results found
- ✅ **KHÔNG có inactive hotels** (even if they match price)

---

## Test Case 10: Complex Multi-Criteria Query ✅

**Query:**
```
I'm looking for a quiet, family-friendly hotel in Sydney with pool, near the beach, under $400
```

**Expected Behavior:**
- ✅ Parse: `{ location: "Sydney", maxPrice: 400, keywords: ["quiet", "family", "pool", "beach"] }`
- ✅ Generate embedding từ full query
- ✅ Vector search tìm hotels với:
  - "quiet" hoặc "peaceful"
  - "family" hoặc "kids"
  - "pool"
  - "beach" hoặc "sand"
- ✅ SQL filters: Location = Sydney, Price <= $400
- ✅ Return hotels match tất cả criteria

**Expected Hotels:**
- Bondi Beach Family ($350) - "Steps from the sand. Includes surfboards and sandcastle kits for kids"
- Manly Family Apartments ($300) - "Relaxed vibe for families"

**Validation:**
- ✅ Location = Sydney
- ✅ Price <= $400
- ✅ High similarity với "quiet", "family", "pool", "beach"
- ✅ Hotels có pool và family-friendly
- ✅ **KHÔNG có inactive hotels**

---

## 🧪 Test Execution Checklist

### Pre-Test Setup
- [ ] Dev server running: `npm run dev`
- [ ] Database có 100 hotels với embeddings
- [ ] RPC function `match_hotels_hybrid` đã được tạo
- [ ] Environment variables configured

### Test Execution

#### Test Case 1: Clarification
- [ ] Input: "I need a hotel under $200"
- [ ] Verify: Clarification message appears
- [ ] Follow-up: "Melbourne"
- [ ] Verify: Hotels returned

#### Test Case 2: Full Query
- [ ] Input: "I need a quiet place in Melbourne under $200"
- [ ] Verify: Hotels returned
- [ ] Verify: All prices <= $200
- [ ] Verify: All locations = Melbourne
- [ ] Verify: No inactive hotels

#### Test Case 3: Semantic Matching
- [ ] Input: "Find me a peaceful hotel in Sydney"
- [ ] Verify: Hotels with "quiet", "silent" descriptions
- [ ] Verify: Similarity scores reasonable

#### Test Case 4: Family-Friendly
- [ ] Input: "I need a family hotel with pool for kids in Brisbane"
- [ ] Verify: Hotels with family-friendly descriptions
- [ ] Verify: Amenities include Pool or Kids Club

#### Test Case 5: Luxury
- [ ] Input: "Show me luxury hotels in Melbourne"
- [ ] Verify: All hotels have tier = "Luxury"
- [ ] Verify: High prices ($600+)

#### Test Case 6: Budget
- [ ] Input: "I want a cheap hotel in Sydney under $100"
- [ ] Verify: All prices <= $100
- [ ] Verify: Location = Sydney

#### Test Case 7: Business
- [ ] Input: "I need a business hotel in Melbourne with WiFi and meeting rooms"
- [ ] Verify: Hotels with business descriptions
- [ ] Verify: Amenities include WiFi, Desk, or Meeting

#### Test Case 8: Price Range
- [ ] Input: "Find hotels in Brisbane between $200 and $400"
- [ ] Verify: All prices >= $200 and <= $400
- [ ] Verify: Location = Brisbane

#### Test Case 9: No Results
- [ ] Input: "I need a luxury hotel in Melbourne under $50"
- [ ] Verify: Empty results or "no hotels found" message
- [ ] Verify: No inactive hotels returned

#### Test Case 10: Complex Query
- [ ] Input: "I'm looking for a quiet, family-friendly hotel in Sydney with pool, near the beach, under $400"
- [ ] Verify: Hotels match all criteria
- [ ] Verify: High similarity scores
- [ ] Verify: Location = Sydney, Price <= $400

---

## 🔒 Security Validation

### For Each Test Case:

1. **Browser DevTools - Network Tab:**
   - [ ] Check API response
   - [ ] Verify NO `is_active` field in response
   - [ ] Verify NO `internal_commission_rate` field in response
   - [ ] Verify NO hotels with IDs 91-100 (inactive)

2. **Response Structure:**
   - [ ] Only safe fields: `id`, `name`, `description`, `location`, `price_per_night`, `tier`, `amenities`, `similarity`
   - [ ] No sensitive columns exposed

3. **Database Query:**
   - [ ] Network tab shows RPC call, NOT `select=*`
   - [ ] RPC call includes parameters: `query_embedding`, `p_location`, `p_max_price`, etc.
   - [ ] Response size reasonable (< 10 hotels typically)

---

## 📊 Expected Results Summary

| Test Case | Location | Price Filter | Expected Hotels | Semantic Match |
|-----------|----------|-------------|-----------------|----------------|
| 1 | Clarification | $200 | - | - |
| 2 | Melbourne | <= $200 | 4-5 hotels | "quiet" |
| 3 | Sydney | None | 3-5 hotels | "peaceful" → "quiet" |
| 4 | Brisbane | None | 2-3 hotels | "family", "pool" |
| 5 | Melbourne | None | 4-5 hotels | "luxury" |
| 6 | Sydney | <= $100 | 3-4 hotels | "cheap" |
| 7 | Melbourne | None | 3-4 hotels | "business" |
| 8 | Brisbane | $200-$400 | 3-5 hotels | - |
| 9 | Melbourne | <= $50 | 0 hotels | "luxury" |
| 10 | Sydney | <= $400 | 2-3 hotels | "quiet", "family", "pool", "beach" |

---

## 🐛 Common Issues & Solutions

### Issue: Clarification not working
- **Check**: API route logic for missing location
- **Fix**: Verify `parseHotelQueryWithOpenAI` returns `null` for location

### Issue: No hotels returned
- **Check**: RPC function parameters
- **Check**: Embeddings generated correctly
- **Fix**: Verify database has embeddings for all hotels

### Issue: Inactive hotels appear
- **Check**: RPC function filter `is_active = true`
- **Fix**: Update RPC function SQL

### Issue: Sensitive data in response
- **Check**: Response type definition
- **Check**: RPC function return columns
- **Fix**: Remove sensitive fields from SELECT

---

## 📝 Notes

- All test cases should be run in browser DevTools
- Check Network tab for API calls
- Verify response structure matches expected types
- Test both clarification and results flows
- Validate security requirements for each test

---

## 🔥 COMPLEX TEST CASES (11-20)

---

## Test Case 11: Vietnamese Language Query 🇻🇳

**Query:**
```
Tìm khách sạn yên tĩnh ở Sydney giá dưới 300 đô
```

**Expected Behavior:**
- ✅ Parse: `{ location: "Sydney", maxPrice: 300, keywords: ["yên tĩnh"] }`
- ✅ LLM response in **Vietnamese**
- ✅ Vector search: "yên tĩnh" → "quiet", "peaceful", "silent"
- ✅ Return hotels với price <= $300

**Expected Result:**
- Response message in Vietnamese: "Tôi tìm thấy X khách sạn phù hợp..."
- Hotels: Blue Mountains Retreat ($220), Sydney Harbour Quiet Suites (nếu <= $300)

**Validation:**
- ✅ Response language matches input language
- ✅ Semantic matching works cross-language

---

## Test Case 12: Conflicting Requirements 🤔

**Query:**
```
I want a cheap luxury hotel in Melbourne under $100
```

**Expected Behavior:**
- ✅ Parse: `{ location: "Melbourne", maxPrice: 100, tier: "Luxury", keywords: ["cheap", "luxury"] }`
- ✅ SQL filter: price <= $100
- ✅ Tier filter: "Luxury"
- ✅ Result: Empty or near-empty (conflict impossible)

**Expected Result:**
- Empty results OR explanation: "Luxury hotels typically start at $600+, so there are no matches under $100"
- LLM validation explains the conflict

**Validation:**
- ✅ No fake results
- ✅ Clear message about conflicting criteria
- ✅ Possibly suggest removing one constraint

---

## Test Case 13: Vague Emotional Query 😌

**Query:**
```
I want somewhere to escape and relax in Sydney after a stressful week
```

**Expected Behavior:**
- ✅ Parse: `{ location: "Sydney", keywords: ["escape", "relax", "stressful"] }`
- ✅ Vector search finds: "peaceful", "quiet", "retreat", "tranquil", "spa", "wellness"
- ✅ No price/tier constraints

**Expected Hotels:**
- Blue Mountains Retreat ($220) - "Surrounded by eucalyptus forest"
- Mosman Manor ($700) - "Very quiet residential area"
- Sydney Harbour Quiet Suites ($400) - "absolute silence"
- Hotels with Spa/Wellness amenities

**Validation:**
- ✅ Semantic matching captures "escape/relax" intent
- ✅ Hotels có relaxing descriptions
- ✅ High similarity với wellness/spa themes

---

## Test Case 14: Specific Amenity Combination 🏊‍♂️

**Query:**
```
Brisbane hotel with pool, gym, and rooftop bar, under $300
```

**Expected Behavior:**
- ✅ Parse: `{ location: "Brisbane", maxPrice: 300, keywords: ["pool", "gym", "rooftop", "bar"], amenities: ["Pool", "Gym", "Bar"] }`
- ✅ SQL filter: price <= $300, amenities overlap
- ✅ Vector search: descriptions mentioning pool, gym, bar

**Expected Hotels:**
- Hotels có >= 2/3 amenities: Pool + Gym + Bar
- Prioritize hotels matching all 3

**Validation:**
- ✅ All hotels <= $300
- ✅ Most hotels have Pool AND Gym
- ✅ Rooftop/Bar is bonus (vector match)

---

## Test Case 15: Negative Keywords (What to Avoid) 🚫

**Query:**
```
I need a quiet hotel in Melbourne, NOT near the airport or highway
```

**Expected Behavior:**
- ✅ Parse: `{ location: "Melbourne", keywords: ["quiet", "not airport", "not highway"] }`
- ✅ Vector search: "quiet" + avoid "airport", "highway"
- ✅ LLM validation filters out hotels near airport/highway

**Expected Hotels:**
- Melbourne Zen Garden Inn ($180) - Quiet, no airport mention
- Botanical Silent Retreat ($175) - Nature retreat
- **EXCLUDE**: Airport Convenience Stay (nếu có)

**Validation:**
- ✅ No hotels with "airport" or "highway" in description
- ✅ LLM explains why certain hotels were ranked lower

---

## Test Case 16: Specific Date/Event Context 🎉

**Query:**
```
Hotel for New Year's Eve in Sydney near harbour with view
```

**Expected Behavior:**
- ✅ Parse: `{ location: "Sydney", keywords: ["new year", "harbour", "view"] }`
- ✅ Vector search: "harbour", "view", "waterfront", "fireworks"
- ✅ Semantic: New Year → fireworks → harbour view

**Expected Hotels:**
- Circular Quay Luxury ($900) - "Views of the Sydney Opera House"
- Sydney Harbour Quiet Suites ($400) - Near harbour
- Hotels with "Harbour View" or "Opera House"

**Validation:**
- ✅ Hotels near Sydney Harbour
- ✅ Description mentions view/harbour/waterfront
- ✅ LLM response mentions the event context

---

## Test Case 17: Pet-Friendly Search 🐕

**Query:**
```
Dog-friendly hotel in Brisbane where I can bring my golden retriever
```

**Expected Behavior:**
- ✅ Parse: `{ location: "Brisbane", keywords: ["dog", "pet", "golden retriever"], amenities: ["Pet-Friendly"] }`
- ✅ Vector search: "pet-friendly", "dogs allowed", "animals welcome"
- ✅ Amenity filter: "Pet-Friendly"

**Expected Hotels:**
- Hotels with "Pet-Friendly" in amenities
- Descriptions mentioning "pets welcome"

**Validation:**
- ✅ Only pet-friendly hotels returned
- ✅ LLM confirms pet policy in response
- ✅ If no pet-friendly hotels: clear message

---

## Test Case 18: Extended Stay / Long-term 📅

**Query:**
```
I need a place in Melbourne for 3 months with kitchen and laundry facilities
```

**Expected Behavior:**
- ✅ Parse: `{ location: "Melbourne", keywords: ["long term", "kitchen", "laundry", "3 months"], amenities: ["Kitchen", "Laundry"] }`
- ✅ Vector search: "apartment", "kitchen", "self-catering", "long stay"
- ✅ Prioritize hotels with Kitchen amenity

**Expected Hotels:**
- Hotels with Kitchen + Laundry amenities
- Apartment-style accommodations
- Reasonably priced (long-term consideration)

**Validation:**
- ✅ Hotels have Kitchen/Laundry amenities
- ✅ Description mentions "apartment" or "self-catering"
- ✅ LLM considers practical long-stay needs

---

## Test Case 19: Accessibility Requirements ♿

**Query:**
```
Wheelchair accessible hotel in Sydney with elevator and accessible bathroom
```

**Expected Behavior:**
- ✅ Parse: `{ location: "Sydney", keywords: ["wheelchair", "accessible", "elevator", "bathroom"], amenities: ["Wheelchair-Accessible"] }`
- ✅ Vector search: "accessible", "disability", "elevator", "ground floor"
- ✅ Amenity filter: "Wheelchair-Accessible"

**Expected Hotels:**
- Hotels with accessibility mentions
- Modern hotels (more likely accessible)

**Validation:**
- ✅ Hotels mention accessibility
- ✅ LLM confirms accessibility features
- ✅ Honest about limited data if not available

---

## Test Case 20: Multi-party / Group Booking 👨‍👩‍👧‍👦

**Query:**
```
Looking for 3 connecting rooms for a group of 10 people in Melbourne, preferably with conference room
```

**Expected Behavior:**
- ✅ Parse: `{ location: "Melbourne", keywords: ["group", "connecting rooms", "10 people", "conference"], amenities: ["Meeting", "Conference"] }`
- ✅ Vector search: "group", "large party", "conference", "meeting room"
- ✅ Prioritize larger hotels

**Expected Hotels:**
- Convention Center Hotel ($230) - "large corporate groups"
- Melbourne CBD Executive ($250) - "5 meeting rooms"
- Larger chain hotels

**Validation:**
- ✅ Hotels có meeting/conference facilities
- ✅ Description mentions groups/large parties
- ✅ LLM suggests contacting hotel for availability

---

## 🧪 Complex Test Execution Checklist

### Test Cases 11-20

#### Test Case 11: Vietnamese Language
- [ ] Input Vietnamese query
- [ ] Verify response in Vietnamese
- [ ] Verify semantic matching works

#### Test Case 12: Conflicting Requirements
- [ ] Input impossible combination
- [ ] Verify empty/near-empty results
- [ ] Verify explanation of conflict

#### Test Case 13: Vague Emotional Query
- [ ] Input emotional/abstract request
- [ ] Verify semantic understanding
- [ ] Verify wellness/relaxation hotels returned

#### Test Case 14: Specific Amenity Combination
- [ ] Input multiple amenities
- [ ] Verify amenity filtering works
- [ ] Verify price constraint applied

#### Test Case 15: Negative Keywords
- [ ] Input "NOT near airport"
- [ ] Verify exclusion logic
- [ ] Verify LLM explains ranking

#### Test Case 16: Specific Date/Event
- [ ] Input event-based query
- [ ] Verify context understanding
- [ ] Verify relevant location matching

#### Test Case 17: Pet-Friendly
- [ ] Input pet-related query
- [ ] Verify pet-friendly filter
- [ ] Verify honest response if no matches

#### Test Case 18: Extended Stay
- [ ] Input long-term stay query
- [ ] Verify kitchen/laundry amenities
- [ ] Verify apartment-style matches

#### Test Case 19: Accessibility
- [ ] Input accessibility requirements
- [ ] Verify accessible hotels returned
- [ ] Verify honest about data limitations

#### Test Case 20: Multi-party/Group
- [ ] Input group booking query
- [ ] Verify conference/meeting amenities
- [ ] Verify LLM suggests contacting hotel

---

## 📊 Complex Cases Results Summary

| Test Case | Language | Difficulty | Key Challenge |
|-----------|----------|------------|---------------|
| 11 | Vietnamese | Medium | Cross-language semantic |
| 12 | English | High | Conflicting requirements |
| 13 | English | Medium | Emotional/vague intent |
| 14 | English | Medium | Multi-amenity combo |
| 15 | English | High | Negative keywords |
| 16 | English | Medium | Event context |
| 17 | English | Medium | Specific amenity |
| 18 | English | Medium | Long-term stay |
| 19 | English | High | Accessibility data |
| 20 | English | High | Group booking logic |

---

## 🎯 Edge Cases to Monitor

1. **Empty Results**: Should provide helpful suggestions
2. **Language Detection**: Vietnamese, Chinese, Japanese, Korean
3. **Conflicting Filters**: Luxury + Budget, Beach + Mountain
4. **Missing Data**: When hotels lack amenity data
5. **Semantic Gaps**: When no hotels match the intent

---

**Last Updated**: 2024-12-24  
**Status**: Ready for Testing ✅

