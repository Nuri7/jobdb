

## Plan: Prefer Main Career Listing Pages Over Filtered Subpages

### Problem Analysis

For Avans Hogeschool, the discovery found `https://www.avans.nl/werken-bij-avans/vacatures/EDUCATION_LEVEL/PHD` (score: 85) instead of `https://www.avans.nl/werken-bij-avans/vacatures` (score: 75).

**Root Cause: Path Depth Bonus**
The current scoring gives +5 points per path segment (up to 20 points). This causes filtered/subset pages to score higher than main listing pages:

| URL | Path Segments | Depth Bonus | Total |
|-----|--------------|-------------|-------|
| `/werken-bij-avans/vacatures` | 2 | +10 | 75 |
| `/werken-bij-avans/vacatures/EDUCATION_LEVEL/PHD` | 4 | +20 | 85 |

### Solution Overview

Add detection for filter/category path segments that indicate a subset of jobs rather than the main listing. Apply penalties to these filtered pages to prefer the comprehensive list.

### Technical Changes

#### 1. Add Filter Path Detection

Create a list of common filter/category patterns that indicate a subset page:

```typescript
const FILTER_PATH_PENALTIES = [
  /EDUCATION_LEVEL/i,
  /EXPERIENCE_LEVEL/i,
  /CONTRACT_TYPE/i,
  /LOCATION/i,
  /DEPARTMENT/i,
  /CATEGORY/i,
  /\/type\//i,
  /\/level\//i,
  /\/region\//i,
  /\/team\//i,
  /\/PHD$/i,
  /\/WO$/i,
  /\/HBO$/i,
  /\/MBO$/i,
  /\/internship$/i,
  /\/stage$/i,
  /\/fulltime$/i,
  /\/parttime$/i,
];
```

Each match applies a **-25 point penalty**.

#### 2. Adjust Path Depth Bonus Logic

Modify the path depth calculation to not reward segments that are filter parameters:

```typescript
// Filter out segments that look like filter parameters
const meaningfulSegments = pathSegments.filter(segment => {
  const segmentUpper = segment.toUpperCase();
  // Skip if it looks like a filter parameter
  return !(/^[A-Z_]+$/.test(segmentUpper) && segmentUpper.length > 3);
});
score += Math.min(meaningfulSegments.length * 5, 20);
```

#### 3. Add "Root Vacatures" Preference

Give a bonus to URLs that end with the main listing path:

```typescript
// Bonus for main career listing pages (not filtered)
if (/\/(vacatures|jobs|careers|openings)$/i.test(pathname) ||
    /\/(vacatures|jobs|careers|openings)\/$/i.test(pathname)) {
  score += 15;
  console.log(`  +15 points for main listing page (ends with vacatures/jobs)`);
}
```

### Scoring Impact After Changes

| URL | Before | After | Change |
|-----|--------|-------|--------|
| `/werken-bij-avans/vacatures` | 75 | 90 | +15 (main listing bonus) |
| `/werken-bij-avans/vacatures/EDUCATION_LEVEL/PHD` | 85 | 50 | -35 (filter penalties, reduced depth) |

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/find-career-page/index.ts` | Add FILTER_PATH_PENALTIES, modify path depth bonus, add main listing bonus |

### Implementation Details

1. **In the scoring function**, add new penalty array and detection
2. **Modify path depth calculation** to skip uppercase parameter segments
3. **Add main listing bonus** for URLs ending in `/vacatures`, `/jobs`, etc.

### Testing Plan

1. Deploy updated edge function
2. Test "Find Career Page" on Avans Hogeschool → expect `avans.nl/werken-bij-avans/vacatures`
3. Re-test ABN AMRO → still finds `werkenbijabnamro.nl/vacatures`
4. Test on other companies to ensure no regressions

