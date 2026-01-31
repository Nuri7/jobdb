

## Plan: Improve Career Page Discovery Accuracy

### Problem Analysis

The current discovery found `https://www.abnamro.nl/en/personal/specially-for/international-students/tips/how-to-find-a-job.html` instead of `https://www.werkenbijabnamro.nl/vacatures` for ABN AMRO.

**Root Causes:**
1. Generic advice/tips pages match career keywords ("job", "find-a-job") but aren't actual job listings
2. Dedicated career domains like `werkenbij[company].nl` aren't prioritized over corporate site subpages
3. URL path segments indicating non-job content (tips, advice, blog, articles) aren't being penalized

### Solution Overview

Enhance the URL scoring algorithm to:
- **Heavily prioritize dedicated career domains** (werkenbij*.nl, careers.*, jobs.*)
- **Penalize generic content indicators** in URLs (tips, advice, blog, how-to, articles)
- **Add domain-matching bonus** when the domain contains career-related keywords
- **Improve search query specificity** to find dedicated career portals

### Technical Changes

#### 1. Add Domain-Level Career Detection

Create a list of career domain patterns and add significant bonus points:

```typescript
const CAREER_DOMAIN_PATTERNS = [
  /werkenbij/i,
  /careers?\./i,
  /jobs?\./i,
  /werken\./i,
  /vacatures?\./i,
  /hiring\./i,
];
```

If the domain matches these patterns, add +50 points.

#### 2. Add URL Path Penalties

Create negative modifiers for generic content paths:

```typescript
const GENERIC_CONTENT_PENALTIES = [
  'tips', 'advice', 'blog', 'articles', 'news', 'magazine',
  'how-to', 'guide', 'specially-for', 'students', 'faq',
  'about-us', 'over-ons', 'contact', 'privacy', 'terms'
];
```

For each penalty keyword found, subtract 30 points.

#### 3. Improve Search Strategy

Add an additional search query specifically targeting dedicated career domains:

```
"werkenbij[company]" OR "werken bij [company]" site:.nl vacatures
```

This helps find `werkenbijabnamro.nl` directly.

#### 4. Scoring Formula Update

Current flow:
- Base: 10 points per career pattern match
- Bonus: 25 points per specificity booster
- Bonus: Up to 20 points for path depth
- Penalty: -5 for generic landing pages

New flow:
- **+50 points**: Domain contains career keywords (werkenbij, careers., jobs.)
- **+30 points**: URL is on a `.nl` TLD with Dutch career terms
- **-30 points**: Per generic content indicator (tips, blog, advice)
- **-50 points**: If URL path contains "how-to" or "guide" 
- Keep existing bonuses for specificity boosters

#### 5. Validation Enhancement

Add negative content checks during page validation:

```typescript
const NON_JOB_INDICATORS = [
  'career tips', 'job hunting advice', 'how to find', 
  'internship guide', 'career advice', 'interview tips'
];
```

If these are found and no actual job listings exist, fail validation.

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/find-career-page/index.ts` | Update scoring function, add domain detection, add penalty keywords, enhance validation |

### Expected Results

For ABN AMRO:
- `werkenbijabnamro.nl/vacatures`: Score ~85 (domain bonus + vacatures booster)
- `abnamro.nl/.../tips/how-to-find-a-job.html`: Score -10 (tips penalty cancels job match)

### Testing Plan

1. Deploy updated edge function
2. Test "Find Career Page" on ABN AMRO
3. Verify `werkenbijabnamro.nl/vacatures` is returned
4. Test on other companies to ensure no regressions

