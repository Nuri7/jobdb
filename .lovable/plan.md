

## Plan: Add Company Name Validation to Career Domain Detection

### Problem Analysis

For "Avans Hogeschool", the discovery found `oud.werkenbijhogescholen.nl/vacatures` (a generic higher education job board) instead of `avans.nl/werken-bij-avans/vacatures` (the company-specific career page).

**Root Cause:**
The `searchDedicatedCareerDomain` function accepts any domain containing "werkenbij" without verifying that the domain actually belongs to the company being searched.

- `werkenbijhogescholen.nl` matches `werkenbij` pattern → accepted ✗
- The algorithm stops and never checks the actual company website

### Solution Overview

Add company name matching to validate that discovered career domains actually belong to or reference the specific company.

### Technical Changes

#### 1. Add Company Name Matching Function

Create a new function to check if a domain contains the company name or a recognizable variation:

```typescript
function domainMatchesCompany(domain: string, companyName: string): boolean {
  const domainLower = domain.toLowerCase();
  const nameLower = companyName.toLowerCase();
  
  // Extract key identifier from company name
  // "Avans Hogeschool" → "avans"
  // "ABN AMRO" → "abnamro" or "abn"
  const nameWords = nameLower.split(/\s+/);
  const primaryWord = nameWords[0];
  const combinedName = nameWords.join('');
  
  // Check if domain contains company identifier
  return domainLower.includes(primaryWord) || 
         domainLower.includes(combinedName);
}
```

#### 2. Update searchDedicatedCareerDomain Logic

Modify the career domain filtering to only accept domains that match the company:

```typescript
// Current (problematic):
if (CAREER_DOMAIN_PATTERNS.some(p => p.test(hostname))) {
  careerDomains.add(hostname);
}

// New (with company validation):
if (CAREER_DOMAIN_PATTERNS.some(p => p.test(hostname))) {
  if (domainMatchesCompany(hostname, companyName)) {
    careerDomains.add(hostname);
  } else {
    console.log(`Skipping ${hostname} - doesn't match company: ${companyName}`);
  }
}
```

#### 3. Add Scoring Penalty for Non-Matching Domains

For URLs that pass through to scoring, add a penalty when the domain doesn't match:

```typescript
// In scoreCareerUrl function:
// If URL is on a dedicated career domain but doesn't match company name
if (hasDedicatedCareerDomain && !domainMatchesCompany(hostname, companyName)) {
  score -= 60; // Significant penalty
  console.log(`  -60 points for career domain not matching company`);
}
```

#### 4. Ensure Website Mapping Is Tried

When dedicated domain search returns nothing valid, ensure the company's actual website (`avans.nl`) is mapped for career pages.

### Expected Behavior After Changes

| Company | Domain Found | Matches Company? | Result |
|---------|-------------|------------------|--------|
| ABN AMRO | werkenbijabnamro.nl | Yes ("abnamro") | ✓ Accept |
| Avans Hogeschool | werkenbijhogescholen.nl | No ("hogescholen" ≠ "avans") | ✗ Skip |
| Avans Hogeschool | avans.nl/werken-bij-avans | Yes ("avans") | ✓ Accept via website map |

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/find-career-page/index.ts` | Add `domainMatchesCompany` function, update career domain filtering, add scoring penalty |

### Implementation Notes

1. Company name extraction handles various formats:
   - "ABN AMRO" → checks for "abn" and "abnamro"
   - "Avans Hogeschool" → checks for "avans" and "avanshogeschool"
   - "a.s.r." → checks for "asr"

2. Generic terms to ignore during matching:
   - "hogeschool", "universiteit", "bv", "nv", "nederland", "group"

3. The website mapping step (STEP 2) will find `avans.nl/werken-bij-avans/vacatures` after the dedicated domain search fails to find a matching domain

### Testing Plan

1. Deploy updated edge function
2. Test "Find Career Page" on Avans Hogeschool → expect `avans.nl/werken-bij-avans/vacatures`
3. Re-test ABN AMRO → still finds `werkenbijabnamro.nl/vacatures`
4. Re-test a.s.r. → still finds `werkenbijasr.nl/vacatures`

