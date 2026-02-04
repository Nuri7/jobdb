

## Plan: Company Tabs on Jobs Page

### Overview

Transform the jobs page to display all companies as horizontal tabs, where selecting a tab shows that company's jobs. This keeps all company and job information accessible on a single page while providing quick navigation between companies.

### Visual Design

```text
+------------------------------------------------------------------+
|  Header Navigation                                                |
+------------------------------------------------------------------+
|  [Search Bar]                     [Bulk Scrape] [Delete All Jobs] |
+------------------------------------------------------------------+
|  TABS (horizontally scrollable):                                  |
|  [All (156)] [ABN AMRO (24)] [ING (18)] [Philips (12)] [...]     |
+------------------------------------------------------------------+
|  Career page: https://careers.company.com  [Scrape] [Delete]      |
+------------------------------------------------------------------+
|  24 jobs                                                          |
|  +--------------------------------------------------------------+ |
|  | Job Card 1                                                   | |
|  +--------------------------------------------------------------+ |
|  | Job Card 2                                                   | |
|  +--------------------------------------------------------------+ |
|  | ...                                                          | |
+------------------------------------------------------------------+
```

### Key Features

1. **Horizontal Tab Bar**: Shows all enabled companies as tabs with job counts
2. **"All" Tab**: First tab shows jobs from all enabled companies (current default behavior)
3. **Scrollable Tabs**: Uses ScrollArea for horizontal scrolling when many companies exist
4. **Per-Tab Actions**: Scrape and Delete buttons context-aware to selected tab
5. **Career URL Display**: Shows career page URL when a specific company is selected
6. **Job Counts in Tabs**: Each tab badge shows the number of jobs for quick reference

### Technical Approach

| Component | Change |
|-----------|--------|
| `src/pages/Index.tsx` | Replace filter-based company selection with Radix Tabs |
| New hook or query | Fetch job counts per company for tab badges |

### Implementation Details

**1. Add Tabs Structure**
- Import `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from shadcn
- Use `ScrollArea` with horizontal orientation for the tab list
- First tab is "All" (value="all"), subsequent tabs use company IDs

**2. Tab Triggers with Job Counts**
- Each company tab shows: `{company_name} ({job_count})`
- "All" tab shows total job count across enabled companies
- Tabs styled with company logos as optional enhancement

**3. State Management**
- Replace `source` state with `activeTab` state
- Tab change triggers job refetch with company filter
- Pagination resets to page 1 when switching tabs

**4. Per-Company Job Counts**
- Fetch job counts grouped by company for tab badges
- Use a separate lightweight query to avoid performance issues

**Code Structure:**

```tsx
<Tabs value={activeTab} onValueChange={handleTabChange}>
  <ScrollArea className="w-full" orientation="horizontal">
    <TabsList className="inline-flex h-10 items-center gap-1 p-1">
      <TabsTrigger value="all">
        All ({totalJobCount})
      </TabsTrigger>
      {enabledCompanies.map(company => (
        <TabsTrigger key={company.id} value={company.id}>
          {company.company_name} ({company.jobs_found_count || 0})
        </TabsTrigger>
      ))}
    </TabsList>
  </ScrollArea>
  
  <TabsContent value={activeTab}>
    {/* Current job list and pagination */}
  </TabsContent>
</Tabs>
```

### Data Flow

1. Fetch all enabled companies with `jobs_found_count`
2. Render tabs from company list
3. When tab changes, update `source` filter and reset pagination
4. Job query automatically refetches with new company filter

### Edge Cases Handled

- **Many companies**: Horizontal scroll prevents overflow
- **Empty companies**: Tabs still show with (0) count
- **Loading states**: Show skeleton or spinner during tab switch
- **URL sync**: Consider adding URL params for deep-linking to specific company tab

### Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Index.tsx` | Add Tabs component, restructure layout, update state management |

### Notes

- The existing `source` state already handles company filtering, so the data layer remains unchanged
- Job counts come from `company_career_sites.jobs_found_count` which is already available
- No database changes required

