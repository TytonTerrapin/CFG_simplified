# CFG Simplifier

**CFG Simplifier** is a high-fidelity, interactive web application designed to demonstrate and perform the formal simplification of **Context-Free Grammars (CFGs)**. It bridges the gap between theoretical computer science and practical tooling by providing a real-time, step-by-step trace of the transformation pipeline.

---

### 🌐 Live Deployment
- **GitHub Pages**: [Live Demo](https://tytonterrapin.github.io/CFG_Simplified/)
- **Vercel Mirror**: [Alternative Link](https://cfg-simplified.vercel.app/)

> [!NOTE]
> Changes pushed to the `main` branch are automatically deployed via Vercel for zero-config static hosting.

---

## 🚀 Key Capabilities

- **Strict Algorithmic Precision**: Implements the standard four-stage simplification pipeline used in formal language theory.
- **Real-Time Pipeline Tracing**: Observes the grammar's evolution through detailed logs and state-by-state comparisons.
- **Morphing Dependency Graphs**: Visualizes symbol relationships and rule dependencies using a dynamic physics-based network.
- **Educational Design**: Integrated theory cards and algorithmic explanations for students and researchers.

---

## ⚙️ The Simplification Pipeline

The tool follows a rigorous sequence to ensure the resulting grammar is strictly minimized while remaining equivalent to the original.

### 1. Initial Useless Symbols Sweep
The first stage removes symbols that contribute nothing to the language generation:
- **Phase 1: Non-Productive Symbols**: Identifies variables that cannot derive a string of terminals. This is done by iteratively building a "Generating Set" $G$.
- **Phase 2: Unreachable Symbols**: Starting from the start symbol $S$, it performs a graph traversal to find all symbols reachable through any sequence of rules. Anything disconnected from $S$ is pruned.

### 2. Null Productions Removal
Eliminates $\epsilon$-productions ($A \to \epsilon$) while preserving the language:
- **Nullable Detection**: Identifies all variables that can derive the empty string, either directly or through other nullable variables.
- **Production Expansion**: For every rule containing nullable symbols, the algorithm generates all valid combinations where those symbols are either present or replaced by $\epsilon$.
- **Cleanup**: Removes all original $A \to \epsilon$ rules.

### 3. Unit Productions Removal
Prunes redundant "chains" (e.g., $A \to B, B \to C$):
- **Derivation Closure**: Calculates the full set of non-terminals reachable from each variable through unit rules only.
- **Direct Substitution**: For a unit rule $A \to B$, it substitutes $A$ with all of $B$'s non-unit productions directly, collapsing the dependency.

### 4. Final Cleanup
A final sweep using the **Useless Symbols** algorithm. This is critical because the Null and Unit removal phases can often leave previously useful symbols isolated or non-productive.

---

## 📊 Technical Architecture & Visualization

### Algorithmic Engine (`logic.js`)
The core logic operates on a JSON-based grammar representation:
- **Set Operations**: Uses iterative fixed-point calculations for $G$ (Generating), $N$ (Nullable), and $R$ (Reachable) sets.
- **Backtracking**: Employs backtracking to generate production combinations during the Null removal phase.
- **Closure Computation**: Uses an adjacency-list graph and BFS/DFS logic to calculate unit derivation closures.

### Interactive Visualization (`vis-network`)
The tool uses `vis-network` to render **Dependency Graphs**:
- **Nodes**: Represent Non-Terminals ($A, B, C$) and Terminals ($a, b, c$).
- **Edges**: Represent production dependencies (e.g., $A \to BC$ creates edges $A \to B$ and $A \to C$).
- **Physics-Based Layout**: The graphs use a force-directed layout to naturally organize complex grammars.
- **Visual Diffing**: Highlights rule additions/deletions across stages using color-coded nodes.

---

## 📝 Grammar Syntax

The editor supports a standard notation for CFG rules:
- **Arrow Notation**: Use `->` to separate the Left-Hand Side (LHS) and Right-Hand Side (RHS).
- **OR Operator**: Use `|` to specify multiple alternatives for a single variable.
- **Null Symbols**: Use `?`, `''`, or `ε` to represent the empty string.
- **Variables**: Uppercase letters (e.g., `S, A, B`).
- **Terminals**: Lowercase letters or symbols (e.g., `a, b, c, 0, 1`).

**Example Input:**
```text
S -> AB | aC
A -> b | ?
B -> b | S
C -> D | ?
D -> d
```

---

## 💻 Local Development

CFG Simplifier is built with **Vanilla ES6 Modules** and requires no build step. To run it locally:

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/TytonTerrapin/CFG_Simplified.git
   ```
2. **Serve the Files**:
   Since it uses browser modules, you must serve it via a local web server:
   - **Node.js**: `npx serve .`
   - **Python**: `python -m http.server 8000`
3. **Access**: Navigate to `http://localhost:3000` or the corresponding port.

---

## 📜 License
Distributed under the **MIT License**. Created for educational exploration of Formal Language Theory.
