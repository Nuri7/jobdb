
## Plan: Fix Booking.com Career Page Discovery

### Problem Analysis

For "Booking.com", the discovery found `jobted.nl/booking.com-vacatures` (score: 60) instead of the official `jobs.booking.com/`.

**Root Causes Identified:**

| Issue | Description |
|-------|-------------|
| **Company identifier** | "Booking.com" extracts as `["bookingcom"]` instead of `["booking", "bookingcom"]` |
| **Missing job board** | `jobted.nl` is not in the generic job boards penalty list |
| **Domain matching** | `jobs.booking.com` won't match identifier "bookingcom" because root domain is `booking.com` |

### Solution Overview

Three targeted fixes to ensure company domains are properly recognized and third-party sites are penalized:

### Technical Changes

#### 1. Add Missing Job Board to Penalty List

Add `jobted.nl` to `GENERIC_JOB_BOARDS`:

```typescript
const GENERIC_JOB_BOARDS = [
  // ... existing entries ...
  'jobted.nl',      // NEW
  'jobted.com',     // NEW
];
```

#### 2. Strip Domain Extensions from Company Names

Handle company names that include domain extensions (e.g., "Booking.com", "Hotels.com"):

```typescript
function extractCompanyIdentifiers(companyName: string): string[] {
  let nameLower = companyName.toLowerCase();
  
  // Strip domain extensions from company names (e.g., "Booking.com" → "Booking")
  nameLower = nameLower.replace(/\.(com|net|org|nl|eu|io|co)$/i, '');
  
  // ... rest of existing logic ...
}
```

This will extract `["booking"]` from "Booking.com" instead of `["bookingcom"]`.

#### 3. Improve Domain Matching Logic

Enhance `urlMatchesCompanyDomain` to better match identifier against root domain:

```typescript
// Current: rootDomain.split('.')[0] === identifier
// Improved: also check if identifier is contained in domain name part
const domainName = rootDomain.split('.')[0]; // "booking" from "booking.com"
if (domainName === identifier || domainName.includes(identifier) || identifier.includes(domainName)) {
  return true;
}
```

### Expected Scoring After Changes

| URL | Before | After | Change |
|-----|--------|-------|--------|
| `jobs.booking.com/` | ~0 (not matching) | ~195 | +100 (own domain) + +80 (career subdomain) + +15 (main listing) |
| `jobted.nl/booking.com-vacatures` | 60 | -20 | -80 (job board penalty) |

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/find-career-page/index.ts` | Add jobted.nl to penalty list, strip domain extensions from company names, improve domain matching |

### Implementation Details

1. **Domain extension stripping** handles:
   - `.com` (Booking.com, Hotels.com)
   - `.nl` (Dutch companies sometimes include this)
   - `.net`, `.org`, `.eu`, `.io`, `.co` (other common TLDs)

2. **Improved identifier extraction for "Booking.com"**:
   - Before: `["bookingcom"]`
   - After: `["booking"]`

3. **Domain matching for `jobs.booking.com`**:
   - Root domain: `booking.com`
   - Domain name: `booking`
   - Identifier: `booking`
   - Match: ✓

### Testing Plan

1. Deploy updated edge function
2. Test "Find Career Page" on Booking.com → expect `jobs.booking.com`
3. Re-test ING, Rabobank, ABN AMRO → verify no regressions
4. Test other ".com" named companies if known
