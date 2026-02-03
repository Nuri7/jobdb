

## Plan: Filter UI/UX Text from Job Descriptions

### Problem

When scraping job pages, the raw markdown content includes interactive UI elements and navigation text that shouldn't be part of the job description:
- Button text: "Solliciteer", "Opslaan", "Verwijderen"
- Navigation: "Terug naar vacatureoverzicht"
- Status messages: "Deze vacature staat nog 10 dagen open"
- Duplicated text from buttons being rendered multiple times

### Solution

Add a content cleaning function to the `scrape-jobs` edge function that removes these UI patterns before storing the description.

### Technical Changes

#### 1. Add UI Text Patterns to Remove

Create a new constant array of patterns to filter out (both Dutch and English):

```text
UI PATTERNS TO REMOVE
=====================
- SolliciteerSolliciteer, Solliciteer
- OpslaanOpslaan, Opslaan
- VerwijderVerwijder, Verwijder
- Terug naar vacatureoverzicht
- Terug naar overzicht
- Deze vacature staat nog X dagen open
- Apply now, Apply, Save job, Save
- Back to jobs, Back to overview
- Share this job, Deel deze vacature
- Print, Print deze pagina
- Copy link, Kopieer link
- Add to favorites, Voeg toe aan favorieten
- Cookie/privacy consent text blocks
- Social sharing buttons (LinkedIn, Facebook, Twitter, etc.)
```

#### 2. Create Clean Description Function

Add a `cleanDescription()` function that:

1. Removes common UI button text patterns
2. Removes navigation links text
3. Removes status/countdown messages
4. Removes social sharing prompts
5. Removes duplicate whitespace/newlines
6. Preserves the actual job content

#### 3. Apply Cleaning Before Storage

Update line 583 in `extractJobData()`:

```text
BEFORE:
description: content.slice(0, 5000)

AFTER:
description: cleanDescription(content).slice(0, 5000)
```

#### 4. Add Configurable Setting (Optional Enhancement)

Add a new `description_cleanup_patterns` setting to the `scraper_settings` table so patterns can be updated without code changes.

### File Changes

| File | Changes |
|------|---------|
| `supabase/functions/scrape-jobs/index.ts` | Add `cleanDescription()` function with UI text removal patterns, apply it to description extraction |

### Implementation Details

The `cleanDescription` function will use regex patterns to:

1. **Remove button patterns** (case-insensitive, handles duplicates):
   - `/Solliciteer(Solliciteer)?/gi`
   - `/Opslaan(Opslaan)?/gi`
   - `/Verwijder(en)?(Verwijder(en)?)?/gi`
   - `/Apply(\s+now)?/gi`
   - `/Save(\s+job)?/gi`

2. **Remove navigation text**:
   - `/Terug naar\s+\w+/gi`
   - `/Back to\s+\w+/gi`

3. **Remove status messages**:
   - `/Deze vacature staat nog \d+ dagen? open/gi`
   - `/This (job|position) (is|will be) (open|available).*/gi`

4. **Remove social/share blocks**:
   - `/Deel (deze vacature|dit|via)/gi`
   - `/Share (this job|on|via)/gi`
   - Lines that are just "LinkedIn", "Facebook", "Twitter", etc.

5. **Clean up whitespace**:
   - Multiple blank lines → single blank line
   - Trailing/leading whitespace per line

### Example Before/After

```text
BEFORE:
Senior Developer

SolliciteerSolliciteer

VerwijderOpslaanOpslaan

Terug naar vacatureoverzicht

Deze vacature staat nog 10 dagen open

We are looking for a Senior Developer to join our team...

LinkedIn Facebook Twitter

Deel deze vacature

AFTER:
Senior Developer

We are looking for a Senior Developer to join our team...
```

