
## Plan: Prevent False Positives Like Privacy Statements in Job Scraping

### Problem Summary

When scraping ABN AMRO, the URL `https://www.werkenbijabnamro.nl/privacy-statement-nl` was incorrectly detected as a job posting with the title "Privacy Statement".

### Root Cause Analysis

| Check | Result | Issue |
|-------|--------|-------|
| `isJobUrl` | Passed | Matches "werk" in domain `werkenbijabnamro.nl`, not the path |
| `isExcluded` | Not excluded | No exclusion for `privacy`, `terms`, `legal`, etc. |
| `isDetailPage` | Passed | Slug pattern `/[a-z]+-[a-z]+-[a-z]+/` matches `privacy-statement-nl` |
| `isValidJobContent` | Passed | Privacy policies contain "submit" (for data submission) |

### Solution

Implement a multi-layer defense against legal/policy page false positives:

1. **URL Path Filtering** - Check job keywords in PATH only, not full URL
2. **Expanded Exclusion Patterns** - Add legal/policy page patterns  
3. **Content-Based Disqualification** - Detect legal document signatures

### Technical Changes

#### 1. Fix `filterJobUrls` - Check Path, Not Full URL

**Current code (line 221-232):**
```typescript
const isJobUrl = (
  lowerUrl.includes('job') || 
  lowerUrl.includes('vacanc') || 
  lowerUrl.includes('werk') ||  // ← Matches domain!
  // ...
);
```

**New approach:**
```typescript
// Extract just the path for job URL detection
const urlPath = new URL(url).pathname.toLowerCase();

const isJobUrl = (
  urlPath.includes('job') || 
  urlPath.includes('vacanc') || 
  urlPath.includes('vacature') ||
  urlPath.includes('position') ||
  urlPath.includes('opening') ||
  // Note: Remove 'werk' - too generic, matches domain names
  // Keep numeric ID patterns
  /\/\d{5,}/.test(url) ||
  /id=\d+/.test(url) ||
  /job[_-]?id/i.test(url)
);
```

#### 2. Add Legal/Policy Page Exclusions

Add built-in exclusions for common non-job page patterns:

```typescript
// Built-in exclusions (always applied)
const BUILT_IN_EXCLUSIONS = [
  'privacy',
  'cookie',
  'terms',
  'disclaimer',
  'legal',
  'policy',
  'policies',
  'gdpr',
  'imprint',
  'impressum',
  'algemene-voorwaarden',
  'privacyverklaring',
  'cookieverklaring',
];

const isExcluded = (
  matchesExcludedPattern ||
  BUILT_IN_EXCLUSIONS.some(pattern => lowerUrl.includes(pattern)) ||
  // ... existing checks
);
```

#### 3. Enhanced Content Validation

Add negative signals that disqualify content as a job posting:

```typescript
function isValidJobContent(content: string, requiredKeywords: string[]): boolean {
  const lowerContent = content.toLowerCase();
  
  // Negative signals - if these appear prominently, it's not a job
  const legalDocumentSignals = [
    'privacy policy',
    'privacyverklaring',
    'cookie policy',
    'terms of service',
    'terms and conditions',
    'algemene voorwaarden',
    'personal data we collect',
    'gegevensbescherming',
    'data protection officer',
    'legal notice',
    'disclaimer',
  ];
  
  // If content starts with or heavily features legal language, reject it
  const contentStart = lowerContent.slice(0, 500);
  const isLegalDocument = legalDocumentSignals.some(signal => 
    contentStart.includes(signal)
  );
  
  if (isLegalDocument) {
    console.log('Rejecting page: Detected as legal/policy document');
    return false;
  }
  
  // Existing keyword and length checks...
  const hasRequiredKeyword = requiredKeywords.some(keyword => 
    lowerContent.includes(keyword.toLowerCase())
  );
  
  const hasReasonableLength = content.length > 200;
  
  return hasRequiredKeyword && hasReasonableLength;
}
```

### File to Modify

| File | Changes |
|------|---------|
| `supabase/functions/scrape-jobs/index.ts` | Update `filterJobUrls` to check path only, add built-in exclusions, enhance `isValidJobContent` with legal document detection |

### Additional Improvement: Clean Existing Data

After deploying the fix, delete the false positive from the database:
```sql
DELETE FROM job_opportunities 
WHERE job_url LIKE '%privacy-statement%' 
   OR job_url LIKE '%cookie%' 
   OR job_url LIKE '%terms%'
   OR job_url LIKE '%disclaimer%';
```

### Expected Behavior After Fix

| URL | Before | After |
|-----|--------|-------|
| `werkenbijabnamro.nl/privacy-statement-nl` | ❌ Scraped as job | ✅ Excluded by URL pattern |
| `werkenbijabnamro.nl/vacature/8970/...` | ✅ Scraped | ✅ Scraped (no change) |
| `werkenbijabnamro.nl/cookie-policy` | ❌ Would be scraped | ✅ Excluded by URL pattern |
| `werkenbijabnamro.nl/algemene-voorwaarden` | ❌ Would be scraped | ✅ Excluded by URL pattern |
