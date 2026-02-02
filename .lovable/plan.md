

## Plan: Fix Career Page Discovery Timeout for Booking.com

### Problem Analysis

When discovering the career page for Booking.com, the request "gets stuck" because:

| Issue | Description |
|-------|-------------|
| **Slow edge function** | The `find-career-page` function takes 30+ seconds for Booking.com due to web scraping/validation |
| **Client timeout** | Supabase client requests timeout before the function completes |
| **No timeout handling** | The UI shows "running" indefinitely without feedback |

**Evidence from logs:**
- Function starts at `16:08:26Z`, completes at `16:09:44Z` (~78 seconds total)
- Network shows `Error: Load failed` (client-side timeout)
- Function actually succeeds: `Found best career page for Booking.com: https://workingatbooking.com`

### Solution Overview

1. Add explicit timeout configuration to the Supabase function call
2. Reduce batch size to 1 for more responsive processing
3. Add proper timeout error handling with user-friendly messages

### Technical Changes

#### 1. Update FindCareerPagesModal.tsx

**Change batch size from 5 to 1:**
```typescript
// Process one at a time for better responsiveness
const batchSize = 1;
```

**Add timeout configuration to function invoke:**
```typescript
const { data, error } = await supabase.functions.invoke('find-career-page', {
  body: {
    companies: batch.map((c) => ({
      company_name: c.company_name,
      website: c.website,
    })),
  },
  // Allow up to 2 minutes for slow companies
  headers: {
    'x-supabase-timeout': '120000'
  }
});
```

**Add AbortController for timeout handling:**
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout

try {
  const { data, error } = await supabase.functions.invoke('find-career-page', {
    body: { ... },
  });
  clearTimeout(timeoutId);
  // ... handle response
} catch (error) {
  clearTimeout(timeoutId);
  if (error.name === 'AbortError') {
    // Handle timeout specifically
    setQueue(prev => prev.map(q => 
      batch.find(b => b.id === q.id) 
        ? { ...q, status: 'failed', error: 'Request timed out - try again' }
        : q
    ));
  }
}
```

**Better error messages:**
```typescript
error: error instanceof Error 
  ? (error.message.includes('Load failed') || error.message.includes('timeout')
    ? 'Request timed out - company may have slow career page'
    : error.message)
  : 'Unknown error',
```

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/FindCareerPagesModal.tsx` | Reduce batch size, add timeout handling, improve error messages |

### Expected Behavior After Fix

1. Companies are processed one at a time (more responsive feedback)
2. Slow companies show "Request timed out" instead of getting stuck
3. User can retry individual companies that timed out
4. UI no longer appears "stuck" on slow companies

### Alternative Consideration

If the edge function itself is too slow, we could also:
- Skip page validation for known patterns (faster but less accurate)
- Add caching for previously found career pages
- Add a "quick mode" that only checks URL patterns without scraping

However, the primary fix of handling timeouts gracefully on the client side should resolve the immediate issue.

