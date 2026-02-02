

## Plan: Prioritize Company's Own Domain Over Third-Party Job Sites

### Problem Analysis

For ING, the discovery found `https://www.youngcapital.nl/werken-bij/ing-vacatures` (score: 75) instead of the official `https://careers.ing.com/en/search-jobs/`.

**Root Cause:**
The scoring system doesn't give preference to the company's own domain. Third-party job boards that mention the company name (YoungCapital, StudentJob) can score similarly or higher than the company's actual career site.

| URL | Current Issues |
|-----|---------------|
| `youngcapital.nl/werken-bij/ing-vacatures` | Third-party site, scores 75 |
| `careers.ing.com/en/search-jobs/` | Company's own domain, but not prioritized |

### Solution Overview

Add company domain detection and apply a significant bonus (+100 points) to URLs on the company's own domain or recognizable career subdomains.

### Technical Changes

#### 1. Add Company Domain Matching Function

Create a function to check if a URL is on the company's own domain:

```typescript
function urlMatchesCompanyDomain(url: string, companyName: string, companyWebsite?: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const identifiers = extractCompanyIdentifiers(companyName);
    
    // If company has a website, check if URL is on same root domain
    if (companyWebsite) {
      const websiteHost = new URL(companyWebsite.startsWith('http') ? companyWebsite : `https://${companyWebsite}`).hostname.toLowerCase();
      const websiteRoot = websiteHost.split('.').slice(-2).join('.');
      const urlRoot = hostname.split('.').slice(-2).join('.');
      
      if (urlRoot === websiteRoot || hostname.endsWith(websiteRoot)) {
        return true; // Same root domain as company website
      }
    }
    
    // Check if domain contains company identifier (e.g., careers.ing.com)
    for (const identifier of identifiers) {
      const rootDomain = hostname.split('.').slice(-2).join('.');
      if (rootDomain.startsWith(identifier) || rootDomain.includes(`.${identifier}.`)) {
        return true;
      }
    }
    
    return false;
  } catch {
    return false;
  }
}
```

#### 2. Add OWN DOMAIN BONUS (+100 points)

In `scoreCareerUrl`, add a new scoring section:

```typescript
// === OWN DOMAIN BONUS (+100 points) ===
// Heavily prioritize the company's own domain over third-party sites
if (companyName && urlMatchesCompanyDomain(url, companyName, companyWebsite)) {
  score += 100;
  console.log(`  +100 points for company's own domain`);
}
```

#### 3. Update Function Signatures

Pass `companyWebsite` through to `scoreCareerUrl` and `findBestCareerUrl`:

```typescript
function scoreCareerUrl(
  url: string, 
  careerPatterns: RegExp[], 
  companyName?: string,
  companyWebsite?: string  // NEW
): number
```

#### 4. Add International Career Subdomain Detection

Enhance detection for `careers.*.com` patterns that match the company:

```typescript
// === INTERNATIONAL CAREER SUBDOMAIN BONUS (+80 points) ===
// careers.company.com, jobs.company.com patterns
if (/^(careers?|jobs)\./i.test(hostname) && domainMatchesCompany(hostname, companyName)) {
  score += 80;
  console.log(`  +80 points for international career subdomain: ${hostname}`);
}
```

### Scoring Impact After Changes

| URL | Before | After | Change |
|-----|--------|-------|--------|
| `careers.ing.com/en/search-jobs/` | ~45 | ~145 | +100 (own domain) |
| `youngcapital.nl/werken-bij/ing-vacatures` | 75 | 75 | No change |

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/find-career-page/index.ts` | Add `urlMatchesCompanyDomain` function, add own domain bonus, update function signatures to pass website |

### Implementation Details

1. **Own domain detection** checks:
   - URL is on the same root domain as the company's website
   - URL domain contains the company name (e.g., `ing.com`)
   
2. **International career subdomains** get extra bonus:
   - `careers.ing.com` → +80 points (career subdomain that matches company)
   - `jobs.philips.com` → +80 points

3. **Combined scoring for ING example**:
   - `careers.ing.com/en/search-jobs/`: +100 (own domain) + +80 (career subdomain) + +10 (search pattern) = ~190
   - `youngcapital.nl/werken-bij/ing-vacatures`: +50 (werkenbij pattern) - 60 (domain mismatch) + 25 (vacatures) = ~75

### Testing Plan

1. Deploy updated edge function
2. Test "Find Career Page" on ING → expect `careers.ing.com`
3. Test Philips → expect `careers.philips.com` or `philips.com/careers`
4. Test KPN → verify own domain prioritization
5. Re-test Rabobank, ABN AMRO, a.s.r. → verify no regressions

