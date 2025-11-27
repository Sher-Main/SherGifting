Reviewing the current landing page structure and drafting a plan to integrate the sections from `frontend.md` while preserving the current theme and optimizing performance.


[5 tools called]


## Plan: Integrate frontend.md sections into current landing page

### Overview
Integrate content from `frontend.md` while keeping the current holiday theme, using only text/content inspiration, and ensuring performance for low-end devices.

---

### Current structure
1. Hero Section (keep as is)
2. How It Works (enhance with solution content)
3. Recipient Experience (keep as is)
4. Why CryptoGifting (keep as is)
5. FAQ (update text only)
6. FinalCTA (enhance with new copy)

---

### New sections to add

#### 1. The Problem section
Location: After Hero, before How It Works

Content from frontend.md (lines 356-440):
- Headline: "The 'Old Way' is Broken"
- Description about gift cards and cash
- Two problem cards:
  - "The 'Lost Card' Problem" — 30% of gift cards never redeemed
  - "The 'Setup' Headache" — Download apps, scan codes

Implementation:
- Create `components/sections/TheProblem.tsx`
- Use GlassCard components (current theme)
- Simple scroll reveal animations (existing pattern)
- No heavy animations — static visual metaphor
- Colors: Use `#BE123C` (red) for problem indicators, current holiday palette
- Layout: 2-column grid (text left, visual right)
- Visual: Simple expired gift card mockup (no complex animations)

---

#### 2. Enhanced Solution section
Location: Replace/enhance current HowItWorks

Content from frontend.md (lines 442-494):
- Headline: "Send Wealth Like An Email"
- Subtitle: "No tech skills required. If you can send a Gmail, you can send an asset."
- Three cards with better copy:
  1. "Enter Email" — Type email, choose amount
  2. "We Magic Link It" — Premium email with secure link
  3. "They Own It" — One click, assets are theirs

Implementation:
- Update `components/sections/HowItWorks.tsx`
- Keep current 3-card layout
- Update text to match frontend.md
- Keep simple hover effects (no 3D tilt on low-end)
- Use current icons and colors

---

#### 3. The Comparison/Stack section
Location: After Why CryptoGifting, before FAQ

Content from frontend.md (lines 496-617):
- Headline: "Why Smart People Gift Assets"
- Three comparison tabs:
  - "Vs. Gift Cards" — Locked to store, expires, no growth
  - "Vs. Cash / Venmo" — Inflation problem, boring, no education
  - "Vs. Stocks" — Setup nightmare, SSN required, intimidating

Implementation:
- Create `components/sections/Comparison.tsx`
- Tab-based interface (simple state, no complex animations)
- Use GlassCard for content areas
- Simple fade transition between tabs (AnimatePresence)
- Colors: Use current holiday theme
- Performance: No heavy parallax, simple opacity transitions

---

#### 4. Risk Reversal section
Location: After Comparison, before FAQ

Content from frontend.md (lines 619-657):
- Badge: "The 48-Hour Guarantee"
- Headline: "What if they don't open it?"
- Description: Auto-refund if not claimed in 48 hours
- Trust indicator: "Zero Risk Guarantee"

Implementation:
- Create `components/sections/RiskReversal.tsx`
- Single GlassCard with centered content
- Use `#10B981` (green) for guarantee badge
- Simple scroll reveal
- No background animations — static gradient only

---

#### 5. FAQ text updates
Location: Update existing FAQ component

Content from frontend.md (lines 659-677):
- "Do they need an app?" — No, email link, secure account in browser
- "Is it safe?" — Yes, Magic Link, bank-grade encryption
- "What assets can I send?" — Bitcoin, Crypto, Stablecoins, Tokenized Stocks/Gold

Implementation:
- Update `components/sections/FAQ.tsx`
- Replace existing FAQ items with new text
- Keep current accordion functionality
- Keep current styling

---

#### 6. Enhanced Final CTA
Location: Update existing FinalCTA

Content from frontend.md (lines 679-703):
- Headline: "Be the Coolest Friend They Have"
- Subtitle: "Send your first gift in 60 seconds. It's free to try."
- CTA button: "Start Gifting Now"
- Footer text: "No credit card required for setup."

Implementation:
- Update `components/sections/FinalCTA.tsx`
- Update headline and copy
- Keep current button and styling
- Keep simple background animations (existing pattern)

---

### Performance optimizations

1. Animations:
   - Use existing Framer Motion scroll reveals (already optimized)
   - Avoid canvas particles (remove from frontend.md)
   - Avoid complex motion values and springs
   - Use `will-change` sparingly
   - Use `transform` and `opacity` only (GPU-friendly)

2. Components:
   - Reuse GlassCard (already optimized)
   - Reuse GlowButton (already optimized)
   - No new heavy components

3. Images/visuals:
   - Use CSS gradients instead of images
   - Simple SVG icons (Lucide React)
   - No large image assets

4. State management:
   - Simple useState for tabs (Comparison section)
   - No complex state management
   - Minimal re-renders

---

### Implementation order

1. Phase 1: Create TheProblem section
2. Phase 2: Update HowItWorks with new solution copy
3. Phase 3: Create Comparison section
4. Phase 4: Create RiskReversal section
5. Phase 5: Update FAQ text
6. Phase 6: Update FinalCTA copy
7. Phase 7: Integrate all sections into LoginPage in correct order

---

### Final section order in LoginPage

1. Hero Section (existing)
2. The Problem (new)
3. How It Works / Solution (enhanced)
4. Recipient Experience (existing)
5. Why CryptoGifting (existing)
6. Comparison / Stack (new)
7. Risk Reversal (new)
8. FAQ (updated text)
9. Final CTA (enhanced)
10. Footer (existing)

---

### Color mapping (keep current theme)

- Primary Red: `#BE123C` (cranberry)
- Gold/Yellow: `#FFB217` or `#FCD34D`
- Cyan: `#06B6D4`
- Success Green: `#10B981`
- Background: `#0B1120`
- Text: `#F8FAFC` (white), `#94A3B8` (muted gray)
- Glass surfaces: `#1E293B` with backdrop blur

---

### Notes

- No canvas-based animations
- No complex motion value chains
- Simple CSS animations where possible
- Reuse existing components
- Maintain current holiday theme
- Text-only inspiration from frontend.md
- All animations use existing patterns (scroll reveals, simple fades)

Should I proceed with implementation?