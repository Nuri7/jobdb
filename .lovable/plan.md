
## Plan: Fix Career Page Discovery for Fontys Hogescholen

### Root Cause Analysis

The discovery failed to find `werkenbijfontys.nl` because:

| Issue | Detail |
|-------|--------|
| **Search query too specific** | Searched for `"werkenbijFontysHogescholen"` instead of also trying `"werkenbijfontys"` |
| **Company identifiers not used** | The function extracts identifiers like `["fontys", "fontyshogescholen"]` but doesn't use them in the dedicated domain search |
| **Validation passed wrong page** | `https://www.fontys.nl/Over-Fontys/Fontys-ICT.htm` passed validation with 3 indicators (likely generic words like "fulltime", "parttime" in course descriptions) |

**Evidence from logs:**
```
Searching for: "werkenbijFontysHogescholen" OR "werken bij Fontys Hogescholen"
Found career domains: []   ← Empty because werkenbijfontys.nl doesn't match this pattern
```

### Solution

Modify `searchDedicatedCareerDomain` to search for **all company identifiers**, not just the full name. This will find `werkenbijfontys.nl` when searching for `werkenbijfontys`.

### Technical Changes

#### 1. Update searchDedicatedCareerDomain Function

**Current approach (line 676):**
```typescript
const searchQuery = `"werkenbij${cleanName.replace(/\s+/g, '')}" OR "werken bij ${cleanName}" site:.nl vacatures`;
```

**New approach:**
```typescript
function searchDedicatedCareerDomain(
  companyName: string,
  apiKey: string,
  careerPatterns: RegExp[]
): Promise<{ url: string; score: number } | null> {
  // Get all company identifiers
  const identifiers = extractCompanyIdentifiers(companyName);
  
  // Build search query using ALL identifiers
  // E.g., for "Fontys Hogescholen": werkenbijfontys, werkenbijfontyshogescholen
  const werkenbijVariants = identifiers
    .map(id => `"werkenbij${id}"`)
    .join(' OR ');
  
  const searchQuery = `(${werkenbijVariants}) OR "werken bij ${companyName}" site:.nl vacatures`;
  // Result: ("werkenbijfontys" OR "werkenbijfontyshogescholen") OR "werken bij Fontys Hogescholen" site:.nl vacatures
  
  console.log(`Searching for dedicated career domain: ${searchQuery}`);
  // ... rest of function
}
```

#### 2. Add Direct Domain Probing

Additionally, directly try common career domain patterns using the company identifiers:

```typescript
// Before doing search, try direct domain probes
for (const identifier of identifiers.slice(0, 2)) { // Try top 2 identifiers
  const directUrls = [
    `https://werkenbij${identifier}.nl/vacatures`,
    `https://werkenbij${identifier}.nl`,
    `https://www.werkenbij${identifier}.nl/vacatures`,
    `https://careers.${identifier}.nl`,
  ];
  
  for (const directUrl of directUrls) {
    try {
      const response = await fetch(directUrl, { method: 'HEAD' });
      if (response.ok) {
        // Validate this URL
        const isValid = await validateCareerPage(directUrl, apiKey, true);
        if (isValid) {
          const score = scoreCareerUrl(directUrl, careerPatterns, companyName);
          console.log(`Found career domain via direct probe: ${directUrl}`);
          return { url: directUrl, score };
        }
      }
    } catch {
      // Domain doesn't exist, continue
    }
  }
}
```

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/find-career-page/index.ts` | Update `searchDedicatedCareerDomain` to use all company identifiers in search query and add direct domain probing |

### Expected Behavior After Fix

1. For "Fontys Hogescholen", the search will include `"werkenbijfontys"` 
2. Direct probing will try `werkenbijfontys.nl/vacatures` which will succeed
3. The correct URL `https://werkenbijfontys.nl/home/onderwijs/vacatures/` will be found

### Test Cases

| Company | Expected Result |
|---------|----------------|
| Fontys Hogescholen | `werkenbijfontys.nl/...` (not fontys.nl) |
| Avans Hogeschool | `werkenbijnavans.nl/...` |
| Erasmus MC | `werkenbijerasmusmc.nl/vacatures` (already works) |
