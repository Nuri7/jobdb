

## Plan: Improve Career Page Discovery for Edge Cases

### Problem Analysis

The current discovery found `https://blog.aiesec.org/wp-content/uploads/2023/12/AIESEC-International-Annual-Report-20192020.pdf` instead of `https://aiesec.org/search` for AIESEC.

**Root Causes:**
1. PDF files are not being filtered out - they can never be valid career pages
2. Blog subdomains (`blog.*`) aren't being penalized
3. The word "search" in paths isn't recognized as a potential career/job search page indicator
4. Annual reports and PDFs often mention jobs/positions, causing false matches

### Solution Overview

Add targeted filters and scoring adjustments that specifically address these issues without affecting the existing Dutch company detection:

### Technical Changes

#### 1. Add File Extension Filter

Immediately reject URLs that point to non-HTML files:

```typescript
const NON_PAGE_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.rar', '.tar', '.gz', '.jpg', '.jpeg', '.png',
  '.gif', '.mp4', '.mp3', '.wav', '.avi', '.mov'
];
```

Any URL ending with these extensions should receive a **-100 penalty** to ensure they're never selected.

#### 2. Add Subdomain Penalties

Penalize known non-career subdomains:

```typescript
const NON_CAREER_SUBDOMAINS = [
  'blog', 'news', 'support', 'help', 'docs', 'wiki',
  'shop', 'store', 'mail', 'api', 'cdn', 'media',
  'static', 'assets', 'images', 'files'
];
```

If the subdomain matches, apply **-40 points**.

#### 3. Add "search" as a Career Pattern Indicator

For organizations that use `/search` for job listings (like AIESEC), add recognition:

```typescript
// Add to SPECIFICITY_BOOSTERS or as special case
const SEARCH_PAGE_PATTERNS = [
  /\/search$/i,
  /\/search\?/i,
  /\/find-opportunities/i,
  /\/explore/i
];
```

Give a modest boost (**+10 points**) but require validation to confirm it's a job search.

#### 4. Add wp-content/uploads Detection

WordPress uploads folders typically contain files, not pages:

```typescript
const HEAVY_PENALTY_PATTERNS = [
  // ... existing patterns
  /wp-content\/uploads/i,
  /\/uploads\//i,
  /\/files\//i,
  /\/documents\//i,
];
```

Apply **-50 points** for these patterns.

#### 5. Enhanced English Search for Non-Dutch Companies

For companies without a `.nl` website or Dutch-specific domains, add an international career search:

```typescript
// For international orgs, try English search terms
const query = `${company.company_name} careers opportunities apply`;
```

This helps find `aiesec.org/search` over blog content.

### Scoring Impact

| URL | Current | After Changes |
|-----|---------|---------------|
| `blog.aiesec.org/.../Annual-Report.pdf` | ~0-10 | **-150** (PDF + blog + uploads) |
| `aiesec.org/search` | ~10 | **+20** (search pattern + validation) |

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/find-career-page/index.ts` | Add file extension filter, subdomain penalties, wp-content detection, search pattern recognition |

### Implementation Details

1. **In `scoreCareerUrl` function:**
   - Check for file extensions early and apply -100 penalty
   - Check subdomain against NON_CAREER_SUBDOMAINS list
   - Add wp-content/uploads to HEAVY_PENALTY_PATTERNS

2. **In `findBestCareerUrl` function:**
   - Pre-filter URLs with non-page extensions before scoring

3. **In search logic:**
   - For companies without `.nl` domains, try an English international search

### Testing Plan

1. Deploy updated edge function
2. Test "Find Career Page" on AIESEC - expect `aiesec.org/search`
3. Re-test ABN AMRO - ensure still finds `werkenbijabnamro.nl/vacatures`
4. Re-test a.s.r. - ensure still finds `werkenbijasr.nl/vacatures`

