# Suite Brand Guide

> Enterprise AI Platform Visual Identity & Design System

---

## 1. Brand Overview

**Suite** is an enterprise AI automation platform designed for professional environments. The visual identity embodies sophistication, clarity, and trustworthiness—inspired by Apple's design philosophy.

### Brand Attributes
- **Professional**: Clean, corporate aesthetic
- **Trustworthy**: Reliable, secure, enterprise-grade
- **Intelligent**: Modern, AI-forward, innovative
- **Accessible**: Clear, readable, inclusive

---

## 2. Color Palette

### Primary Colors

| Token | HSL Value | Hex | Usage |
|-------|-----------|-----|-------|
| `--primary` | `217 91% 60%` | `#3b82f6` | Primary actions, links, accents |
| `--suite-navy` | `222 47% 11%` | `#0f172a` | Headers, dark backgrounds |
| `--suite-blue` | `217 91% 60%` | `#3b82f6` | Interactive elements |

### Neutral Colors

| Token | HSL Value | Usage |
|-------|-----------|-------|
| `--background` | `0 0% 100%` (light) / `222 47% 11%` (dark) | Page backgrounds |
| `--foreground` | `222 47% 11%` (light) / `210 40% 98%` (dark) | Primary text |
| `--muted` | `220 14% 96%` (light) / `217 33% 25%` (dark) | Subtle backgrounds |
| `--muted-foreground` | `220 9% 46%` | Secondary text |
| `--border` | `220 13% 91%` (light) / `217 33% 25%` (dark) | Borders, dividers |

### Status Colors

| Token | HSL Value | Usage |
|-------|-----------|-------|
| `--suite-success` | `142 71% 45%` | Success states, positive feedback |
| `--suite-warning` | `38 92% 50%` | Warnings, pending states |
| `--suite-danger` | `0 84% 60%` | Errors, destructive actions |
| `--suite-info` | `199 89% 48%` | Informational states |

### Usage Guidelines
- Always use semantic color tokens (`bg-primary`, `text-foreground`)
- Never use raw hex/rgb values in components
- Ensure 4.5:1 contrast ratio for body text (WCAG AA)
- Ensure 3:1 contrast ratio for large text and UI components

---

## 3. Typography

### Font Stack

```css
font-family: 'Inter', 'SF Pro Display', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
```

### Type Scale

| Level | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| H1 | 2.25rem (36px) | 700 | 1.2 | Page titles |
| H2 | 1.875rem (30px) | 600 | 1.3 | Section headers |
| H3 | 1.5rem (24px) | 600 | 1.4 | Card titles |
| H4 | 1.25rem (20px) | 500 | 1.4 | Subsection headers |
| Body | 1rem (16px) | 400 | 1.5 | Primary content |
| Small | 0.875rem (14px) | 400 | 1.5 | Secondary content |
| Caption | 0.75rem (12px) | 400 | 1.4 | Labels, metadata |

### Font Weights
- **300**: Light (use sparingly)
- **400**: Regular (body text)
- **500**: Medium (emphasis, labels)
- **600**: Semibold (headings, buttons)
- **700**: Bold (page titles)

---

## 4. Spacing System

Based on 4px base unit:

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Tight spacing, inline elements |
| `space-2` | 8px | Small gaps, icon spacing |
| `space-3` | 12px | Form element spacing |
| `space-4` | 16px | Standard component padding |
| `space-6` | 24px | Card padding, section gaps |
| `space-8` | 32px | Large section spacing |
| `space-12` | 48px | Page section dividers |
| `space-16` | 64px | Major page sections |

---

## 5. Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded-sm` | 0.375rem (6px) | Small buttons, badges |
| `rounded-md` | 0.5rem (8px) | Inputs, small cards |
| `rounded-lg` | 0.75rem (12px) | Cards, modals |
| `rounded-xl` | 1rem (16px) | Large cards, panels |
| `rounded-full` | 9999px | Pills, avatars |

---

## 6. Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `shadow-sm` | `0 1px 2px hsl(222 47% 11% / 0.05)` | Subtle elevation |
| `shadow-md` | `0 4px 6px -1px hsl(222 47% 11% / 0.1)` | Cards, dropdowns |
| `shadow-lg` | `0 10px 15px -3px hsl(222 47% 11% / 0.1)` | Modals, popovers |
| `shadow-glow` | `0 0 20px hsl(217 91% 60% / 0.15)` | Focus states, highlights |

---

## 7. Animation Principles

### Timing
- **Micro-interactions**: 150ms (hover, focus)
- **Transitions**: 200-300ms (state changes)
- **Entrances**: 300-400ms (page elements)
- **Exits**: 200ms (removals)

### Easing
- **ease-out**: Default for entrances
- **ease-in-out**: State transitions
- **ease-in**: Exit animations

### Standard Animations

| Name | Duration | Usage |
|------|----------|-------|
| `fade-in` | 300ms | Element entrances |
| `slide-up` | 400ms | List items, cards |
| `scale-in` | 200ms | Modals, popovers |
| `pulse-subtle` | 2000ms | Status indicators |
| `shimmer` | 1500ms | Loading skeletons |

### Reduced Motion
Always respect `prefers-reduced-motion`:
```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; }
}
```

---

## 8. Component Patterns

### Buttons

| Variant | Background | Text | Usage |
|---------|------------|------|-------|
| Default | `bg-primary` | `text-primary-foreground` | Primary actions |
| Secondary | `bg-secondary` | `text-secondary-foreground` | Secondary actions |
| Outline | `border-input` | `text-foreground` | Tertiary actions |
| Ghost | Transparent | `text-foreground` | Subtle actions |
| Destructive | `bg-destructive` | `text-destructive-foreground` | Dangerous actions |

**States:**
- Hover: Scale 1.02, subtle shadow
- Active: Scale 0.98
- Focus: Ring with `ring-primary`
- Disabled: 50% opacity

### Cards

- Background: `bg-card`
- Border: `border-border/60`
- Shadow: `shadow-sm` default, `shadow-md` on hover
- Hover: `-translate-y-0.5` lift effect

### Inputs

- Background: `bg-background`
- Border: `border-input`
- Focus: `ring-2 ring-primary`
- Placeholder: `text-muted-foreground`

---

## 9. Iconography

### Icon Library
Use **Lucide React** for all icons.

### Sizes
| Size | Usage |
|------|-------|
| 16px (`h-4 w-4`) | Inline with text, small buttons |
| 20px (`h-5 w-5`) | Standard buttons, list items |
| 24px (`h-6 w-6`) | Headers, standalone icons |
| 32px+ | Feature icons, empty states |

### Style Guidelines
- Use `currentColor` for icon fill
- Match stroke width to text weight
- Maintain consistent visual weight

---

## 10. Voice & Tone

### Principles
- **Clear**: Use simple, direct language
- **Confident**: Avoid hedging ("might", "possibly")
- **Professional**: Enterprise-appropriate vocabulary
- **Helpful**: Guide users toward success

### Do's
- "Configure your settings" ✓
- "View system activity" ✓
- "Processing your request" ✓

### Don'ts
- "Hey! Let's set stuff up!" ✗
- "Oops! Something broke!" ✗
- "Click here to do the thing" ✗

### Terminology

| Instead of | Use |
|------------|-----|
| XMRT tokens | Suite Credits |
| Eliza | Suite Assistant |
| Council | Executive Board |
| Treasury | Finance |
| Contributors | Team |

---

## 11. Accessibility Requirements

### WCAG AA Compliance
- **Color contrast**: 4.5:1 for normal text, 3:1 for large text
- **Focus indicators**: Visible focus rings on all interactive elements
- **Keyboard navigation**: All functionality accessible via keyboard
- **Screen readers**: Proper ARIA labels and semantic HTML
- **Reduced motion**: Respect user preferences

### Required ARIA Labels
- All buttons without visible text
- Form inputs
- Loading states
- Status indicators
- Modal dialogs

---

## 12. File Naming Conventions

### Components
- PascalCase: `SkeletonCard.tsx`
- Grouped by feature: `components/ui/`, `components/features/`

### Styles
- kebab-case: `index.css`, `tailwind.config.ts`

### Assets
- kebab-case: `suite-logo.svg`, `hero-image.png`

---

*Last Updated: December 2024*
*Version: 1.0.0*
