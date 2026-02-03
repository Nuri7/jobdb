

## Plan: Increase Job Description Character Limit

### Overview

Increase the job description storage limit from 5,000 to 15,000 characters to capture more complete job descriptions.

### Change

Update the character slice in `supabase/functions/scrape-jobs/index.ts`:

**Line 639:**
```typescript
// BEFORE
description: cleanDescription(content).slice(0, 5000),

// AFTER
description: cleanDescription(content).slice(0, 15000),
```

### File Changes

| File | Change |
|------|--------|
| `supabase/functions/scrape-jobs/index.ts` | Update `.slice(0, 5000)` to `.slice(0, 15000)` |

### Notes

- The database column is `TEXT` type, so it can handle much longer content
- 15,000 characters is approximately 2,500-3,000 words, which should cover most full job descriptions
- Existing jobs will keep their current (truncated) descriptions until they are re-scraped

