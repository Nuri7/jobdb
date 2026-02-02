
## Plan: Fix Career Page Discovery for Fontys Hogescholen

### Status: ✅ IMPLEMENTED

### Root Cause Analysis

The discovery failed to find `werkenbijfontys.nl` because:

| Issue | Detail |
|-------|--------|
| **Search query too specific** | Searched for `"werkenbijFontysHogescholen"` instead of also trying `"werkenbijfontys"` |
| **Company identifiers not used** | The function extracts identifiers like `["fontys", "fontyshogescholen"]` but doesn't use them in the dedicated domain search |
| **Validation passed wrong page** | `https://www.fontys.nl/Over-Fontys/Fontys-ICT.htm` passed validation with 3 indicators (likely generic words like "fulltime", "parttime" in course descriptions) |

### Solution Implemented

Modified `searchDedicatedCareerDomain` to:

1. **Use all company identifiers in search query**
   - Now searches for `("werkenbijfontys" OR "werkenbijfontyshogescholen")` instead of just `"werkenbijFontysHogescholen"`

2. **Add direct domain probing BEFORE search**
   - Probes common career domain patterns directly (faster and more reliable):
     - `werkenbij${identifier}.nl/vacatures`
     - `werkenbij${identifier}.nl`
     - `careers.${identifier}.nl`
     - `jobs.${identifier}.nl`
   - Uses HEAD requests with 5s timeout for fast probing
   - Validates discovered domains before returning

### Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/find-career-page/index.ts` | Rewrote `searchDedicatedCareerDomain` function with multi-identifier search and direct domain probing |

### Expected Behavior After Fix

1. For "Fontys Hogescholen", direct probe will try `werkenbijfontys.nl/vacatures`
2. If probe succeeds, validates and returns immediately (no search needed)
3. Fallback search now includes `"werkenbijfontys"` in query

### Test Cases

| Company | Expected Result |
|---------|----------------|
| Fontys Hogescholen | `werkenbijfontys.nl/...` (not fontys.nl) |
| Avans Hogeschool | `werkenbijnavans.nl/...` |
| Erasmus MC | `werkenbijerasmusmc.nl/vacatures` (already works) |
