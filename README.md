# CFG Simplifier

## Overview

CFG Simplifier is an interactive, web-based tool designed to visualize and perform the step-by-step simplification of Context-Free Grammars (CFGs). It acts as both an educational platform for understanding the theory of formal languages and a practical utility for generating strict, minimized, and equivalent grammars.

Live demo: https://tytonterrapin.github.io/CFG_Simplified/


Link 2: https://cfg-simplified.vercel.app/

Deployment: Hosted using Vercel for zero-config static deployment from this repository. Changes pushed to the main branch are auto-deployed.

The simplification process rigorously applies four standard algorithmic phases to guarantee that the grammar maintains its original language without any redundant rules.

## Core Features

- **Educational Theory Integration**: Offers built-in explanations for the theory behind CFG simplification, making it ideal for computer science students and educators.
- **Dynamic Rule Builder**: Provides an easy-to-use graphical interface and text editor for constructing and testing custom grammar rules.
- **Strict Four-Stage Pipeline**:
  1. **Initial Sweep for Useless Symbols**: Identifies and removes non-productive and unreachable tokens.
  2. **Null Productions Removal**: Detects nullable non-terminals and generates safe sub-rules derived from the empty string (epsilon).
  3. **Unit Productions Removal**: Collapses direct variable-to-variable dependency chains via derivation closure calculations.
  4. **Final Useless Symbols Cleanup**: Sweeps newly generated disconnected or useless tokens that emerged in the previous phases.
- **Interactive Visualization**: Uses `vis-network` to generate visually comprehensive, morphing dependency graphs that trace the transformations step-by-step.
- **Before-and-After Tracing**: Generates comprehensive log traces and inline grammar differentials to clearly isolate rule additions and deletions across states.

## Technologies Used

This project relies on a lightweight stack without complex build dependencies:
- **HTML5 & CSS3** for structure and modern, responsive styling.
- **Vanilla JavaScript (ES6 Modules)** for logic, pipeline orchestration, and DOM manipulation.
- **Vis.js Network Library** (via CDN) for dynamic and morphing graph visualizations. 

## Project Structure

- `index.html`: The main entry point housing the UI and application layout.
- `app.js`: Connects the UI components with the algorithmic pipeline and orchestrates the graph renderings.
- `logic.js`: Contains the purely algorithmic logic operating on grammar objects (finding nullable sets, substituting derivation paths, and calculating set closures).
- `style.css`: Contains all stylesheets for typography, layout, and graph container styling.

## Running Locally

Because the project leverages native JavaScript Modules, it needs to be served via a local web server to prevent browser CORS restrictions. 

1. **Clone or Download the Repository**.
2. **Navigate to the Directory** via your terminal:
   ```bash
   cd path/to/TAFL_project_2.0
   ```
3. **Start a Local Server**:
   - For Node.js users:
     ```bash
     npx serve .
     ```
   - For Python 3 users:
     ```bash
     python -m http.server 8000
     ```
4. **View in Browser**: Open `http://localhost:3000` (Node) or `http://localhost:8000` (Python).

## Usage Guide

1. **Define Grammar**: Type out your CFG in the text editor. Use syntax like `S -> aB | ?` where `?` or `ε` represent empty/null productions.
2. **Load Presets**: Alternatively, use the built-in dropdown selector to load specific theoretical test cases (e.g., Heavy Null Cascading or Deep Unit Chains).
3. **Execute**: Click the "Execute Simplification Pipeline" button.
4. **Review**: Scroll through the execution trace panel to review each algorithmic phase, reading the generated logs and observing the interactive diff-graphs mapping before to after.
5. **Morphing Slideshow**: At the bottom pane, utilize the dynamic playback controls to repeatedly visualize exactly how your grammar evolves across the pipeline.
