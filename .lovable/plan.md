
# Add Company via API

This plan adds a new `POST /companies` endpoint to the API that mirrors the "Add Company" functionality in the UI. When a company is added via the API, it will be automatically enabled for scraping and trigger an immediate scrape.

## Overview

The new endpoint will:
1. Accept company details (name, career_url, industry) via POST request
2. Validate required fields (name and career_url)
3. Insert the company with `is_scrape_enabled: true` by default
4. Trigger an automatic scrape via the existing `scrape-jobs` function
5. Return the created company data

---

## Changes

### 1. Update API Edge Function

**File:** `supabase/functions/api/index.ts`

Add a new `POST /companies` route that:
- Validates required fields (`name`, `career_url`)
- Checks for duplicate career URLs
- Inserts the company with scraping enabled
- Triggers the `scrape-jobs` function automatically
- Returns the created company with a logo URL

**New endpoint documentation:**
```
POST /api/companies
{
  "name": "Company Name",        // required
  "career_url": "https://...",   // required
  "industry": "Technology"       // optional
}
```

### 2. Update API Documentation

**File:** `supabase/functions/api/index.ts`

Update the root `/` documentation endpoint to include the new `POST /companies` endpoint with its parameters.

### 3. Update Frontend Documentation

**File:** `src/pages/Api.tsx`

Add the new `POST /companies` endpoint to the documentation display on the API page.

---

## Technical Details

### Request Body Schema
```typescript
{
  name: string;        // Required - Company name
  career_url: string;  // Required - Career page URL
  industry?: string;   // Optional - Industry category
}
```

### Response Format (201 Created)
```json
{
  "data": {
    "id": "uuid",
    "name": "Company Name",
    "career_url": "https://...",
    "company_logo": "https://www.google.com/s2/favicons?domain=...",
    "industry": "Technology",
    "is_scrape_enabled": true,
    "scrape_triggered": true
  },
  "message": "Company created and scrape initiated"
}
```

### Error Responses
- `400 Bad Request` - Missing required fields or invalid URL
- `409 Conflict` - Company with same career URL already exists
- `401 Unauthorized` - Missing or invalid API key
- `500 Internal Server Error` - Database or scrape error

### Auto-Scrape Implementation
The endpoint will call the existing `scrape-jobs` edge function using the Supabase client's `functions.invoke` method. This runs asynchronously so the API response returns quickly while scraping happens in the background.

---

## Sequence Diagram

```text
Client                   API Function              Database           scrape-jobs
  |                          |                        |                    |
  |-- POST /companies ------>|                        |                    |
  |                          |-- Validate input       |                    |
  |                          |                        |                    |
  |                          |-- Check duplicates --->|                    |
  |                          |<-- No conflict --------|                    |
  |                          |                        |                    |
  |                          |-- INSERT company ----->|                    |
  |                          |<-- Company data -------|                    |
  |                          |                        |                    |
  |                          |-- Invoke (async) ------|----------------->  |
  |                          |                        |                    |
  |<-- 201 Created ----------|                        |                    |
  |                          |                        |    (scraping...)   |
```

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/api/index.ts` | Add POST /companies route with validation, insert, and auto-scrape |
| `src/pages/Api.tsx` | Add POST /companies to documentation endpoints list |
