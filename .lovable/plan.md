

## Plan: Add Expandable Job Descriptions to Job Cards

### Overview

Add a "Show more" / "Show less" toggle button to each job card that expands to reveal the full job description with markdown formatting. When collapsed, the card shows only the current metadata. When expanded, the full description appears below.

### User Experience

**Collapsed State (Default)**
- Current card layout with title, URL, metadata, badges
- Small "Show more" button/chevron at bottom right

**Expanded State**
- Card grows to accommodate full description
- Description rendered with markdown formatting
- "Show less" button to collapse

### Technical Changes

#### 1. Update JobListItem Props

Add new prop for the description:

```typescript
interface JobListItemProps {
  // ... existing props
  description?: string | null;  // NEW
}
```

#### 2. Add Expand/Collapse State & UI

Update `JobListItem.tsx`:

- Add `isExpanded` state
- Add expand/collapse toggle button (ChevronDown/ChevronUp icons)
- Use Collapsible component from shadcn/ui for smooth animation
- Render description with ReactMarkdown when expanded
- Stop propagation on toggle to prevent modal from opening

#### 3. Update Index.tsx

Pass the description prop to JobListItem:

```typescript
<JobListItem
  // ... existing props
  description={job.description}
/>
```

### File Changes

| File | Changes |
|------|---------|
| `src/components/JobListItem.tsx` | Add `description` prop, `isExpanded` state, Collapsible wrapper, expand/collapse button, ReactMarkdown for description |
| `src/pages/Index.tsx` | Pass `description={job.description}` to JobListItem |

### Component Structure

```
JobListItem (card container)
+-- Logo
+-- Content
|   +-- Title
|   +-- Job URL
|   +-- Metadata row (location, type, experience, industry, salary)
|   +-- Collapsible  <-- NEW
|       +-- CollapsibleContent
|           +-- ReactMarkdown (description)
+-- Meta (company, badges)
+-- Expand Toggle Button  <-- NEW
```

### Visual Design

- Toggle button: Small pill with "Show more" text + chevron icon
- Expanded description: 
  - Light background (bg-muted/50)
  - Rounded corners
  - Proper padding
  - Markdown prose styling
- Smooth height animation via Collapsible component

