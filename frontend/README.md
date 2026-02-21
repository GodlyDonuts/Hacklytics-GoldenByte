# Crisis Topography — Frontend

Next.js 16 + React 19 landing page and 3D globe explorer for the Crisis Topography Command Center. The landing page uses a **sphinx.ai-inspired scroll-triggered theme system** where the entire page (navbar, background, text, borders, buttons) changes color as you scroll between sections.

---

## Quick Start

```bash
npm install
npm run dev          # http://localhost:3000
```

Environment variables (`.env.local`):

```
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=<your-agent-id>
```

---

## Routes

| Route | Component | Description |
|---|---|---|
| `/` | `LandingContent` | Marketing landing page with scroll-triggered color phases |
| `/landing` | Same as `/` | Alias for the landing page |
| `/globe` | `GlobeScene` | Interactive 3D globe with ElevenLabs voice agent |

---

## Architecture Overview

```
src/
├── app/
│   ├── layout.tsx          # Root layout — Geist fonts, globals.css import
│   ├── page.tsx            # / route — renders <LandingContent />
│   ├── globals.css         # Design system — ALL colors use var(--phase-*)
│   ├── globe/
│   │   └── page.tsx        # /globe route — 3D globe + voice agent
│   └── landing/
│       └── page.tsx        # /landing alias — same as root page
│
├── components/
│   ├── VoiceAgent.tsx      # ElevenLabs voice agent (spacebar push-to-talk)
│   ├── Globe/
│   │   └── GlobeView.tsx   # react-globe.gl wrapper (currently unused)
│   └── landing/            # Landing page components ↓
│       ├── ThemeProvider.tsx
│       ├── LandingContent.tsx
│       ├── Navbar.tsx
│       ├── Hero.tsx
│       ├── UseCaseGrid.tsx
│       ├── FeatureHighlights.tsx
│       ├── SocialProof.tsx
│       └── Footer.tsx
```

---

## Scroll-Triggered Theme System

This is the most important architectural decision in the frontend. Instead of painting individual sections with different background colors, we use a **global phase system** that changes the entire page at once.

### How it works

1. **`ThemeProvider.tsx`** wraps all landing content. It uses `IntersectionObserver` to detect which section is currently in the viewport.

2. Each section registers itself with a **phase** (`'dark'` or `'light'`):
   ```tsx
   const { registerSection } = useTheme();
   useEffect(() => {
     registerSection('hero', 'dark', sectionRef);
   }, [registerSection]);
   ```

3. When a section enters the viewport, `ThemeProvider` updates **CSS custom properties on `<html>`**:
   - `--phase-bg`, `--phase-text`, `--phase-border`, `--phase-accent`, etc.
   - ~20 variables total, covering every color in the UI

4. **Every component** reads from `var(--phase-*)` instead of hardcoded colors. This means when the phase changes, the **entire page** — including the fixed navbar — shifts color together.

5. **`globals.css`** adds `transition: 0.6s ease` to all phase-dependent properties, so the shift is smooth.

### Phase flow (scroll order)

```
Dark  → Hero
Light → Use-case tabs
Dark  → Feature highlights
Dark  → Social proof / quote
Light → Footer (matches the "tabs" light phase)
```

### Phase color definitions

| Property | Dark Phase | Light Phase |
|---|---|---|
| `--phase-bg` | `#1a1520` (deep midnight purple) | `#e8e0d4` (warm sand/stone) |
| `--phase-text` | `#ede8e0` (warm cream) | `#2a1f18` (dark espresso) |
| `--phase-accent` | `#2dd4a8` (teal) | `#1a8a6e` (darker teal) |
| `--phase-cta-bg` | `#2dd4a8` | `#2a1f18` |
| `--phase-cta-text` | `#1a1520` | `#e8e0d4` |
| `--phase-nav-bg` | `rgba(26,21,32,0.92)` | `rgba(232,224,212,0.92)` |

---

## Component Reference

### `ThemeProvider.tsx`
**Purpose:** The brain of the color system. Manages scroll-based phase detection and CSS variable updates.

- Exports `useTheme()` hook for child components
- `registerSection(id, phase, ref)` — called by each section on mount
- Uses `IntersectionObserver` with `rootMargin: '-20% 0px -40% 0px'` to trigger when a section enters the top 40% of viewport
- Defines two phase objects (`PHASES.dark` and `PHASES.light`) with all CSS variable mappings

### `LandingContent.tsx`
**Purpose:** Client component wrapper. Wraps everything in `<ThemeProvider>` so the theme context is available.

- The root `page.tsx` is a server component (for metadata), so this client component is needed for hooks/context.

### `Navbar.tsx`
**Purpose:** Fixed top navigation bar that shifts color with the page.

- Reads all colors from `var(--phase-*)` via inline styles
- Backdrop blur + semi-transparent background on scroll
- Mobile hamburger menu with AnimatePresence
- CTA button color inverts between phases (teal on dark, dark on light)

### `Hero.tsx`
**Purpose:** Full-viewport hero with massive headline, subtitle, CTA, and a 3-column product preview window.

- Registers as `'dark'` phase
- Window frame shows: voice prompt demo, globe wireframe SVG, mismatch ranking table
- All text/borders use phase variables

### `UseCaseGrid.tsx`
**Purpose:** Tabbed section with 4 use cases. **This triggers the first light phase.**

- Registers as `'light'` phase
- Tabs: FUNDING GAP, ANOMALY DETECTION, VOICE AI, COMPARISON
- Each tab renders a different visual: bar chart, code block, conversation UI, comparison table
- `AnimatePresence` for smooth tab transitions
- 2-column layout: window-frame visual + text description

### `FeatureHighlights.tsx`
**Purpose:** Three alternating left/right feature rows with window-frame visuals.

- Registers as `'dark'` phase
- Features: Interactive 3D Globe, ML Anomaly Detection, Voice-Navigable Intelligence
- Each visual is inside a `window-frame` container
- Layout alternates direction using `flex-row` / `flex-row-reverse`

### `SocialProof.tsx`
**Purpose:** Editorial blockquote + 4-column stat grid.

- Registers as `'dark'` phase
- Large double-quote mark (`"`) with serif font
- Stats: 190+ countries, 24.8M people, $2.8B funding, 5.5× disparity
- Stats grid uses `gap-px` trick for thin borders between cells

### `Footer.tsx`
**Purpose:** Big CTA headline + 3-column link grid + copyright bar. **Triggers the final light phase.**

- Registers as `'light'` phase
- Massive "See the data. Change the narrative." heading
- Link columns: Product, Resources, Project
- Brand blurb with globe SVG logo

---

## Globe Page (`/globe`)

- Uses `react-globe.gl` via `next/dynamic` (SSR disabled — WebGL)
- Renders 20 random arcs on the globe
- Includes `<VoiceAgent />` overlay

### `VoiceAgent.tsx`
- Integrates ElevenLabs conversational AI via `@elevenlabs/react`
- **Push-to-talk**: Hold spacebar to unmute mic, release to mute
- First spacebar press auto-connects the WebSocket session
- Aurora effect: emerald/cyan/blue gradient glow at bottom of screen while space is held
- Agent speaking indicator: faint blue pulse when AI is talking

---

## `globals.css` — Design System

All styling is driven by CSS custom properties updated at runtime. Key classes:

| Class | Purpose |
|---|---|
| `.bg-grid` | Coordinate grid overlay (sphinx-style architectural lines) |
| `.window-frame` | App preview container with rounded corners |
| `.window-dots` | macOS-style red/yellow/green dots |
| `.heading-massive` | `clamp(3.5rem, 8vw, 7.5rem)` — hero-scale headlines |
| `.heading-large` | `clamp(2rem, 4vw, 3.5rem)` — section headlines |
| `.heading-section` | `clamp(1.5rem, 3vw, 2.25rem)` — feature titles |
| `.body-large` | `1.125rem` body text |
| `.label-caps` | `0.75rem` uppercase tracking labels |
| `.dot-cluster` | 2×2 dot grid divider |
| `.phase-*` | Utility classes for phase-aware colors |
| `.aurora-*` | Keyframe animations for voice agent glow |

---

## Dependencies

| Package | Purpose |
|---|---|
| `next` 16.1.6 | App framework |
| `react` / `react-dom` 19.2.3 | UI library |
| `framer-motion` 12.34.3 | Animations (section reveals, tab transitions, nav) |
| `react-globe.gl` 2.37.0 | 3D globe visualization (WebGL/Three.js) |
| `@elevenlabs/react` 0.14.0 | Voice agent SDK (WebSocket push-to-talk) |
| `d3-scale` / `d3-scale-chromatic` | Color scales for data visualization |
| `tailwindcss` 4 | Utility CSS (used sparingly, most styles are custom) |

---

## Design Decisions

1. **Why phase variables instead of Tailwind dark/light mode?**
   Tailwind's `dark:` modifier is binary (dark or light) and user-preference-based. Our system needs *scroll-position-based* switching with arbitrary phase count, so CSS custom properties updated via JS are the right tool.

2. **Why `IntersectionObserver` instead of scroll events?**
   IO is non-blocking and runs off the main thread. Scroll events fire 60+ times/second and cause jank.

3. **Why a separate `LandingContent.tsx` client component?**
   Next.js App Router needs server components for `export const metadata`. But `ThemeProvider` requires React context (client-only). So `page.tsx` is a thin server wrapper that renders the client `<LandingContent />`.

4. **Why `next/dynamic` for the Globe?**
   `react-globe.gl` uses Three.js/WebGL which requires `window`. Dynamic import with `ssr: false` prevents server-side crashes.
