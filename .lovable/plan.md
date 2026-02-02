## Completed: Prioritize Company's Own Domain Over Third-Party Job Sites

### Implementation Summary

✅ **Completed on 2026-02-02**

Added own domain prioritization to the career page discovery engine:

1. **Added `urlMatchesCompanyDomain` function** - Checks if a URL is on the company's own domain by:
   - Comparing against the company's website root domain
   - Checking if the root domain contains the company identifier

2. **Added +100 point Own Domain Bonus** - URLs on the company's own domain get heavily prioritized

3. **Added +80 point International Career Subdomain Bonus** - `careers.company.com` and `jobs.company.com` patterns get additional bonus

4. **Updated function signatures** - `scoreCareerUrl` and `findBestCareerUrl` now accept `companyWebsite` parameter

### Test Results

| Company | Before | After | Status |
|---------|--------|-------|--------|
| ING | `youngcapital.nl/werken-bij/ing-vacatures` (75) | `ing.nl/carriere` (100) | ✅ Fixed |
| Rabobank | `werkenbijrabobank.nl/vacatures` (170) | `werkenbijrabobank.nl/vacatures` (170) | ✅ No regression |
| ABN AMRO | `werkenbijabnamro.nl/vacatures` (170) | `werkenbijabnamro.nl/vacatures` (170) | ✅ No regression |

### Remaining Limitations

Philips and KPN still return third-party sites because:
- Their official career domains (`careers.philips.com`, `werkenbijkpn.nl`) are not being returned by the Firecrawl search API
- The own domain bonus can only apply to URLs that are present in the search results

**Potential future improvement**: Add a direct check for known career domain patterns (`careers.{company}.com`, `werkenbij{company}.nl`) before falling back to search.
