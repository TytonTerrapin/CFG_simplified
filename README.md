# CFG Simplified

**CFG Simplified** is a high-fidelity, interactive platform for the formal simplification of **Context-Free Grammars (CFGs)**. It bridges the gap between theoretical computer science and practical tooling by providing a real-time, state-first execution trace of the transformation pipeline.

## Key Capabilities

- **Immutable Transformation Pipeline**: Decouples algorithmic logic from rendering by capturing independent grammar states at every stage, ensuring a reliable and traceable evolution.
- **Strict Algorithmic Precision**: Operates on the standard mathematical sequence (Null → Unit → Useless) required for formal grammar equivalence.
- **Interactive Execution Traces**: Provides deep visibility into the transformation process through detailed algorithmic logs and state-by-state comparisons.
- **Dynamic Dependency Visualization**: Maps symbol relationships and rule dependencies using a physics-based force-directed network tailored to each pipeline stage.
- **Animated Grammar Morphing**: Step through or auto-play the full transformation with CSS-animated token diffing — removed tokens shrink out, added tokens grow in.
- **Automated Validation**: Features a proactive convergence engine that mathematically verifies the stability of the final output via a second-pass re-execution.
- **Professional PDF Reporting**: Generates comprehensive, multi-page PDF reports with a branded cover page, per-stage transformation logs, 2x upscaled graph captures, side-by-side grammar comparisons, and reduction summary tables.

## The Simplification Pipeline

The platform follows a rigorous sequence to ensure grammars are strictly minimized while remaining equivalent to the original source.

### 1. Null Productions Removal
Eliminates ε-productions (A → ε) while preserving language integrity through exhaustive power-set expansion. This stage identifies all nullable variables via fixed-point iteration and generates the required alternative rules.

### 2. Unit Productions Removal
Prunes redundant "alias" transitions (e.g., A → B) by calculating the full mathematical derivation closure D(A) for every variable and substituting them with direct productions.

### 3. Useless Symbols Pruning
Deletes symbols that cannot contribute to terminal strings or are unreachable from the start symbol. A two-phase fixed-point sweep (Generating set → Reachable set) ensures only productive, reachable symbols remain.

### 4. Convergence Validation
A definitive safety check that re-processes the final result through the entire pipeline to verify absolute structural stability.

## Architecture

CFG Simplified is built on a **Functional-State Architecture** with strict separation of concerns:

- **`logic.js`** — Pure, deterministic algorithmic engine. Each stage function receives a grammar and returns an immutable state record containing the transformed grammar, step logs, computed sets, and metrics.
- **`app.js`** — Application controller. Manages parsing, the `pipelineHistory[]` state array, DOM rendering, vis-network graph construction, animated playback, and event handling.
- **`pdfReport.js`** — Declarative PDF document builder using pdfmake. Consumes `pipelineHistory` and canvas captures to produce a structured report with automatic pagination.
- **`style.css`** — Full design system with CSS custom properties, grid layouts, glassmorphic graph overlays, and keyframe animations for token morphing.

## Grammar Syntax

The system supports standard notation for context-free rules:
- **Arrow Notation**: Supports `->`, `=>`, `::=`, and `:` operators.
- **Alternative Operator**: Supports `|` and `/` for rule branching.
- **Empty Productions**: Supports `?`, `''`, and `ε` for the empty string.
- **Variable/Terminal Case**: Standard uppercase for variables and lowercase for terminals.

## Tech Stack

- **Engine**: Pure ES6+ JavaScript modules — zero build step, no Node.js required at runtime.
- **Styling**: CSS3 with custom properties, Grid/Flexbox layouts, and keyframe animations.
- **Visualization**: Force-directed graph rendering via [vis-network](https://visjs.github.io/vis-network/docs/network/).
- **Reporting**: Declarative PDF generation via [pdfmake](http://pdfmake.org/) with 2x canvas upscaling and automatic pagination.
- **Typography**: [Outfit](https://fonts.google.com/specimen/Outfit) for UI, [Fira Code](https://fonts.google.com/specimen/Fira+Code) for grammar rules.

## How to Run

Open `index.html` directly in any modern browser, or serve locally for full ES module support:

```bash
python -m http.server 8080   # or: npx serve .
```

## License
MIT License — Copyright (c) 2026 Arnav Bansal. See [LICENSE](LICENSE) for full text.
