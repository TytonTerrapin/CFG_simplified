# CFG Simplified 2.0

**CFG Simplified** is a high-fidelity, interactive web application designed to demonstrate and perform the formal simplification of **Context-Free Grammars (CFGs)**. It bridges the gap between theoretical computer science and practical tooling by providing a real-time, state-first execution trace of the transformation pipeline.

## Table of Contents
1. [Key Capabilities](#key-capabilities)
2. [The Simplification Pipeline](#the-simplification-pipeline)
3. [Modern UI & UX](#modern-ui--ux)
4. [Grammar Syntax](#grammar-syntax)
5. [Tech Stack](#tech-stack)
6. [Getting Started](#getting-started)
7. [Architecture](#architecture)
8. [License](#license)

## Key Capabilities

- **State-First Architecture**: Decouples algorithmic logic from rendering, maintaining a complete execution history of the grammar's evolution.
- **Strict Algorithmic Precision**: Implements the standard four-stage simplification pipeline used in formal language theory.
- **Real-Time Pipeline Tracing**: Observes the grammar's evolution through detailed, JSON-driven logs and state-by-state comparisons.
- **High-Fidelity Dependency Graphs**: Visualizes symbol relationships and rule dependencies using a dynamic physics-based network with per-stage state captures.
- **Professional PDF Reporting**: Generates data-driven, print-optimized documents using `jsPDF` and `AutoTable`, including embedded graph states.

## The Simplification Pipeline

The tool follows a rigorous sequence to ensure the resulting grammar is strictly minimized while remaining equivalent to the original.

### 1. Initial Useless Symbols Sweep
Removes symbols that contribute nothing to the language generation:
- **Phase 1: Non-Productive Symbols**: Identifies variables that cannot derive a string of terminals via fixed-point iteration.
- **Phase 2: Unreachable Symbols**: Performs a graph traversal from the start symbol $S$ to prune disconnected components.

### 2. Null Productions Removal
Eliminates $\epsilon$-productions ($A \to \epsilon$) while preserving language equivalence:
- **Nullable Detection**: Identifies variables that can derive the empty string.
- **Production Expansion**: Generates all valid combinations of rules by substituting nullable occurrences with $\epsilon$.

### 3. Unit Productions Removal
Prunes redundant "chains" (e.g., $A \to B$):
- **Derivation Closure**: Calculates the set of non-terminals reachable from each variable through unit rules.
- **Direct Substitution**: Collapses unit dependencies by mapping all non-unit rules of $B$ directly to $A$.

### 4. Final Cleanup
A secondary sweep using the **Useless Symbols** algorithm to catch any symbols that became isolated during the Null and Unit removal phases.

## Modern UI & UX

- **Floating Stage Navigator**: A persistent, glassmorphic sidebar allowing instant jumping between pipeline stages.
- **Scroll Progress Bar**: Global position awareness with a sleek top-aligned progress indicator.
- **IntersectionObserver Animations**: Sections smoothly slide and fade into view as you navigate the execution trace.
- **Technical Blueprint Aesthetic**: A dark-mode, cyberpunk-inspired design with emerald highlights and glassmorphic blurs.

## Grammar Syntax

The editor supports standard notation for CFG rules:
- **Arrow Notation**: Use `->`, `=>`, or `::=` to separate LHS and RHS.
- **OR Operator**: Use `|` to specify multiple alternatives.
- **Null Symbols**: Use `?`, `''`, or `ε` to represent the empty string.
- **Variables**: Uppercase letters (e.g., `S, A, B`).
- **Terminals**: Lowercase letters, numbers, or symbols.

**Example Input:**
```text
S -> AB | aC
A -> b | ?
B -> b | S
C -> D | ?
D -> d
```

## Tech Stack

- **HTML5/CSS3**: Semantic structure with **Glassmorphism** and CSS custom properties.
- **Vanilla JavaScript**: Pure ES6 modules for core logic and UI orchestration.
- **vis-network**: Real-time force-directed graph rendering.
- **jsPDF & AutoTable**: Professional programmatic PDF generation from JSON states.
- **Fonts**: Outfit (UI), Fira Code (Monospace).

## Getting Started

### Running Locally

Since this is a static project using ES modules, you must serve it via a local web server:

**Option 1: Node.js (Recommended)**
```bash
npx serve .
```

**Option 2: Python**
```bash
python -m http.server 8000
```

## Architecture

### Logic Engine (`logic.js`)
The logic engine is now state-driven, returning standardized `StageRecord` objects. This allows for:
- **Metrics Calculation**: Automated complexity tracking across every transformation.
- **Algorithmic Justification**: Detailed logs of why specific rules were added or removed.

### UI Controller (`app.js`)
- **Pipeline History**: Maintains a `pipelineHistory` array as the single source of truth for the entire run.
- **State Capture**: Captures `vis-network` canvas states as PNGs for the PDF reporting system.
- **Responsive Navigation**: Synchronizes the Stage Navigator with scroll position using `IntersectionObserver`.

## License
Distributed under the **MIT License**. Created for high-fidelity educational exploration of Formal Language Theory.
