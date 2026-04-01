# CFG Simplified 

**CFG Simplified** is a high-fidelity, interactive platform for the formal simplification of **Context-Free Grammars (CFGs)**. It bridges the gap between theoretical computer science and practical tooling by providing a real-time, state-first execution trace of the transformation pipeline.

## Key Capabilities

- **Immutable Transformation Pipeline**: Decouples algorithmic logic from rendering by capturing independent grammar states at every stage, ensuring a reliable and traceable evolution.
- **Strict Algorithmic Precision**: Operates on the standard mathematical sequence (Null → Unit → Useless) required for formal grammar equivalence.
- **Interactive Execution Traces**: Provides deep visibility into the transformation process through detailed algorithmic logs and state-by-state comparisons.
- **Dynamic Dependency Visualization**: Maps symbol relationships and rule dependencies using a physics-based network tailored to each pipeline stage.
- **Automated Validation**: Features a proactive convergence engine that mathematically verifies the stability of the final output.
- **Data-Driven Reporting**: Generates comprehensive PDF reports including embedded graphs, metrics, and complete execution histories.

## The Simplification Pipeline

The platform follows a rigorous sequence to ensure grammars are strictly minimized while remaining equivalent to the original source.

### 1. Null Productions Removal
Eliminates $\epsilon$-productions ($A \to \epsilon$) while preserving language integrity through exhaustive power-set expansion. This stage identifies all nullable variables and generates the required alternative rules until epsilon-equivalence is achieved.

### 2. Unit Productions Removal
Prunes redundant "alias" transitions (e.g., $A \to B$) by calculating the full mathematical derivation closure $\mathcal{D}(A)$ for every variable and substituting them with direct productions.

### 3. Useless Symbols Pruning
Deletes symbols that cannot contribute to terminal strings or are unreachable from the start symbol. A two-phase fixed-point sweep ensures that only productive and reachable symbols remain in the final grammar tree.

### 4. Convergence Validation
A definitive safety check that re-processes the final result through the entire pipeline to verify absolute structural stability. 

## UI & UX Design

- **High-Legibility Differential Views**: Employs colored text indicators and semantic highlighting to visualize additions and removals clearly, even in large rule sets.
- **Floating Stage Navigator**: A persistent navigation system that allows instant jumping between transformation states.
- **Scientific Blueprint Aesthetic**: A professional dark-mode interface designed for educational clarity and technical exploration.
- **Real-Time Statistical Tracking**: Monitors rule count, variable density, and terminal distribution across every step of the process.

## Grammar Syntax

The system supports standard notation for context-free rules:
- **Arrow Notation**: Supports `->`, `=>`, and `::=` operators.
- **Alternative Operator**: Supports `|` and `/` for rule branching.
- **Empty Productions**: Supports `?`, `''`, and `ε` for the empty string.
- **Variable/Terminal Case**: Standard uppercase for variables and lowercase for terminals.

## Tech Stack

- **Engine**: Pure ES6+ JavaScript modules.
- **Styling**: Specialized CSS3 with glassmorphic depth and custom properties.
- **Visualization**: Force-directed graph rendering via `vis-network`.
- **Reporting**: Programmatic document generation via `jsPDF` and `AutoTable`.

## Architecture

CFG Simplified is built on a **Functional-State Architecture**. The core logic, contained in `logic.js`, is designed to be purely deterministic, returning standardized trace records. The UI layer in `app.js` manages a persistent history of these records as the single source of truth, enabling advanced features like multi-stage graph morphing and cross-stage PDF generation.

## License
Distributed under the **MIT License**. Crafted for high-fidelity exploration of formal language theory.
