

# Per-Company Scraping Configuration

## Problem Analysis

Currently, all companies share global scraper settings (extraction prompt, patterns, etc.) from the `scraper_settings` table. However, different companies have vastly different website structures:

- **Traditional career pages** (e.g., ASR): Individual job URLs that can be scraped separately
- **Single-page sites** (e.g., DataFuse AI): All jobs on one page with expandable sections
- **ATS platforms** (e.g., Greenhouse, Lever): Require specific handling
- **Custom sites**: May need special click actions, wait times, or extraction logic

## Proposed Solution

Add per-company scraping configuration stored directly on the `company_career_sites` table. When a specific company tab is selected, show a "Scraper Settings" button that opens a modal to configure company-specific settings.

The scraper will prioritize company-specific settings, falling back to global settings when not specified.

---

## Implementation Overview

### 1. Database Changes

Add a new column to store company-specific scraping configuration:

```sql
ALTER TABLE company_career_sites 
ADD COLUMN scrape_config JSONB DEFAULT NULL;
```

The `scrape_config` will store optional overrides:
- `extraction_prompt`: Custom AI extraction prompt for this company
- `scrape_mode`: "individual" | "single_page" | "actions"
- `click_selectors`: CSS selectors to click before scraping (for expandable content)
- `wait_time`: Custom wait time in milliseconds
- `job_url_patterns`: Custom patterns to identify job URLs
- `excluded_url_patterns`: Company-specific exclusions
- `notes`: Free-text notes about this company's structure

### 2. New Component: CompanyScrapeSettingsModal

A modal accessible from the per-company action bar with these sections:

**Scrape Mode**
- Individual Pages (default): Standard multi-page scraping
- Single Page: All jobs on one page, use regex extraction
- Actions Mode: Click to expand content before scraping

**Extraction Prompt** (textarea)
- Pre-filled with global default
- Allows company-specific customization

**Click Selectors** (when Actions Mode)
- List of CSS selectors to click before content extraction
- Examples: `[class*="view-detail"]`, `button[aria-expanded="false"]`

**Custom Wait Time** (input)
- Override the global wait time for slow-loading pages

**URL Patterns** (chips)
- Job URL patterns specific to this company's site structure
- Excluded patterns for this company

### 3. Update Edge Function: scrape-jobs

Modify the scraper to check for company-specific config:

```typescript
// In Deno.serve handler
const { data: companyData } = await supabase
  .from('company_career_sites')
  .select('scrape_config')
  .eq('id', companyId)
  .single();

const companyConfig = companyData?.scrape_config || {};

// Merge with global settings (company overrides global)
const effectiveSettings = {
  ...globalSettings,
  ...companyConfig,
};

// Use scrape_mode to determine scraping strategy
if (effectiveSettings.scrape_mode === 'single_page') {
  // Force single-page extraction
} else if (effectiveSettings.scrape_mode === 'actions') {
  // Use scrapePageWithActions with custom selectors
}
```

### 4. UI Integration on Jobs Page

Add a settings button to the per-company action bar (next to Edit, History, Exclude):

```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setScrapeSettingsCompany(selectedCompany)}
      >
        <Sliders className="w-4 h-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>Configure scraper settings</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

---

## Files to Create/Modify

| File | Change |
|------|--------|
| `supabase/migrations/add_scrape_config.sql` | Add `scrape_config JSONB` column |
| `src/components/CompanyScrapeSettingsModal.tsx` | New modal component |
| `src/pages/Index.tsx` | Add settings button and modal state |
| `supabase/functions/scrape-jobs/index.ts` | Load and apply company-specific config |

---

## User Experience Flow

1. User selects a company tab (e.g., "DataFuse AI")
2. User clicks the new "Sliders" icon in the action bar
3. Modal opens with:
   - Current scrape mode (defaults to "Individual Pages")
   - Option to switch to "Single Page" or "Actions Mode"
   - Textarea for custom extraction prompt
   - Inputs for click selectors (if Actions Mode)
   - Custom patterns and wait time
4. User saves configuration
5. Next scrape uses the custom configuration

---

## Technical Details

### Scrape Mode Detection

The modal can offer an "Auto-detect" feature that:
1. Fetches the career page
2. Counts individual job URLs found
3. Suggests "Single Page" mode if no URLs detected
4. Checks for common expandable patterns (accordions, "View Detail" buttons)

### Fallback Chain

```
Company scrape_config → Global scraper_settings → Hardcoded defaults
```

### Schema for scrape_config

```json
{
  "scrape_mode": "single_page",
  "extraction_prompt": "Custom prompt for this company...",
  "click_selectors": [
    "[class*='view-detail']",
    "button[aria-expanded='false']"
  ],
  "wait_time": 5000,
  "job_url_patterns": ["position", "opening"],
  "excluded_url_patterns": ["/team", "/about"],
  "notes": "This site uses accordions for job details"
}
```

