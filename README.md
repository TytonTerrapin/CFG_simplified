# CFG Simplified

**CFG Simplified** is a high-fidelity, interactive web application designed to demonstrate and perform the formal simplification of **Context-Free Grammars (CFGs)**. It bridges the gap between theoretical computer science and practical tooling by providing a real-time, step-by-step trace of the transformation pipeline.

## Table of Contents
1. [Key Capabilities](#key-capabilities)
2. [The Simplification Pipeline](#the-simplification-pipeline)
3. [Interactive Visualization](#interactive-visualization)
4. [Grammar Syntax](#grammar-syntax)
5. [Tech Stack](#tech-stack)
6. [Getting Started](#getting-started)
7. [Usage Guide](#usage-guide)
8. [Architecture](#architecture)
9. [License](#license)

## Key Capabilities

- **Strict Algorithmic Precision**: Implements the standard four-stage simplification pipeline used in formal language theory.
- **Real-Time Pipeline Tracing**: Observes the grammar's evolution through detailed logs and state-by-state comparisons.
- **Morphing Dependency Graphs**: Visualizes symbol relationships and rule dependencies using a dynamic physics-based network.
- **Educational Design**: Integrated theory sections and algorithmic explanations for students and researchers.
- **Dynamic Rule Builder**: A GUI-based tool to construct grammars without manual text editing.
- **Report Export**: Generate comprehensive PDF documents of the entire simplification trace.

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

## Interactive Visualization

The tool uses `vis-network` to render dynamic **Dependency Graphs**:
- **Nodes**: Represent Non-Terminals ($A, B, C$) and Terminals ($a, b, c$).
- **Edges**: Represent production dependencies (e.g., $A \to BC$ creates edges $A \to B$ and $A \to C$).
- **Physics-Based Layout**: Uses a force-directed layout to naturally organize complex grammars.
- **Visual Diffing**: Highlights rule additions/deletions across stages using color-coded nodes and edges.

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

- **HTML5/CSS3**: Semantic structure with a modern dark-mode aesthetic.
- **Vanilla JavaScript**: Pure ES6 modules for core logic and UI orchestration.
- **vis-network**: Real-time force-directed graph rendering.
- **html2pdf.js**: Client-side PDF generation for reports.
- **Fonts**: Outfit (UI), Fira Code (Monospace).

## Getting Started

### Running Locally

Since this is a static project, you must serve it via a local web server to handle ES modules:

**Option 1: Node.js**
```bash
npx serve .
```

**Option 2: Python**
```bash
python -m http.server 8000
```

**Option 3: VS Code**
Open `index.html` and use the **Live Server** extension.

## Usage Guide

1. **Input Grammar**: Use the **Text Editor** or the **Dynamic Rule Builder**.
2. **Execute**: Click "Execute Simplification Pipeline".
3. **Analyze**: Scroll through the panels to see **Algorithmic Traces**, **Dependency Graphs**, and **Before/After Diffs**.
4. **Playback**: Use the "Playback Controls" at the bottom to morph between stages in a single graph.
5. **Export**: Use the "Download Report" button for a detailed PDF analysis.

## Architecture

### Logic Engine (`logic.js`)
- **Iterative Fixed-Point**: Used for $G$ (Generating), $N$ (Nullable), and $R$ (Reachable) sets.
- **Combinatorial Expansion**: Employs backtracking to generate production variations.
- **Closure Computation**: Uses an adjacency-list graph to calculate unit derivation closures.

### UI Controller (`app.js`)
- **State Management**: Tracks the grammar's state across 5 pipeline stages.
- **Graph Morphing**: Synchronized rendering of dependency changes using `vis-network` datasets.
- **Animation System**: Scroll-linked CSS animations for a smooth execution flow.

## License
Distributed under the **MIT License**. Created for educational exploration of Formal Language Theory.
