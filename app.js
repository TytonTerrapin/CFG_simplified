import { remove_null_productions, remove_unit_productions, remove_useless_symbols, _calculate_metrics } from './logic.js';
import { generateReport } from './pdfReport.js';

const DOM = {
    cfgInput: document.getElementById('cfg-input'),
    btnStart: document.getElementById('btn-start'),
    btnClear: document.getElementById('btn-clear'),
    exampleSelect: document.getElementById('example-select'),

    btnAddRule: document.getElementById('btn-add-rule'),
    builderLhs: document.getElementById('builder-lhs'),
    builderRhs: document.getElementById('builder-rhs'),

    pipelineResults: document.getElementById('pipeline-results'),

    // Stage-specific containers
    stages: [
        {
            panel: document.getElementById('step-1'),
            logs: document.getElementById('null-logs'),
            before: document.getElementById('null-before'),
            after: document.getElementById('null-after'),
            network: document.getElementById('null-network'),
            stats: 'null-stats',
            sets: 'null-sets'
        },
        {
            panel: document.getElementById('step-2'),
            logs: document.getElementById('unit-logs'),
            before: document.getElementById('unit-before'),
            after: document.getElementById('unit-after'),
            network: document.getElementById('unit-network'),
            stats: 'unit-stats',
            sets: 'unit-sets'
        },
        {
            panel: document.getElementById('step-3'),
            logs: document.getElementById('useless-logs'),
            before: document.getElementById('useless-before'),
            after: document.getElementById('useless-after'),
            network: document.getElementById('useless-network'),
            stats: 'useless-stats',
            sets: 'useless-sets'
        },
        {
            panel: document.getElementById('step-4'),
            logs: document.getElementById('final-logs'),
            before: document.getElementById('final-before'),
            after: document.getElementById('final-after'),
            network: document.getElementById('final-network'),
            stats: 'final-stats-summary',
            sets: 'final-sets-summary'
        }
    ],
    // Dynamic Replay
    btnPrevGraph: document.getElementById('btn-prev-graph'),
    btnNextGraph: document.getElementById('btn-next-graph'),
    graphStageLabel: document.getElementById('graph-stage-label'),
    dynamicNetwork: document.getElementById('dynamic-network'),
    dynamicGrammar: document.getElementById('dynamic-grammar'),
    dynamicStats: document.getElementById('dynamic-stats'),
    btnAutoPlay: document.getElementById('btn-auto-play'),

    // Navigator & Progress
    navigator: document.getElementById('stage-navigator'),
    navItems: document.querySelectorAll('.nav-item'),
    progressBar: document.getElementById('scroll-progress'),

    btnExportReport: document.getElementById('btn-export-report'),
    btnThemeToggle: document.getElementById('theme-toggle'),
};

const STAGE_LABELS = [
    "Original Grammar",
    "Stage 1: Null Productions",
    "Stage 2: Unit Productions",
    "Stage 3: Useless Symbols",
    "Stage 4: Validation & Summary"
];

const EXAMPLES = {
    general: "S -> ABaC\nA -> BC\nB -> b | ?\nC -> D | ?\nD -> d",
    nulls: "S -> ABC\nA -> a | ?\nB -> b | ?\nC -> c | ?",
    units: "S -> A\nA -> B\nB -> C\nC -> D\nD -> a | b",
    useless: "S -> AB | C\nA -> a\nB -> bA\nC -> cC\nD -> d",
    complex1: "S -> ABCD | EFG\nA -> aA | B | ?\nB -> bB | C | ?\nC -> cC | D | ?\nD -> dD | a | ?\nE -> eE | F",
    complex2: "S -> XYZ | UVW\nX -> Y | a\nY -> Z | b\nZ -> X | c | ?"
};

// --- Helpers & Global State ---
const isVar = (s) => s && s.length === 1 && s >= 'A' && s <= 'Z';
const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
};
const isLightMode = () => document.documentElement.getAttribute('data-theme') === 'light';
const getNodeFontColor = () => isLightMode() ? '#1e293b' : '#fff';
const getNodeFontStroke = () => isLightMode() ? '#fff' : '#000';

let pipelineHistory = [];
let networkInstances = {};
let currentPlaybackStage = 0;

// --- Parsing & Helpers ---

function parseGrammar(text) {
    const lines = text.split('\n');
    const grammar = {};
    const separatorRegex = /(->|=>|::=|:)/;
    const emptyTokens = ["'", "''", '""', '?', 'ε'];

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        const match = line.match(separatorRegex);
        if (!match) continue;
        const separator = match[0];
        const parts = line.split(separator);
        const lhs = parts[0].trim();
        if (!lhs) continue;
        const rhsRawToken = line.substring(line.indexOf(separator) + separator.length).trim();
        const rhsRaw = rhsRawToken.split(/[|\/]/).map(s => s.trim());
        const rhs = rhsRaw.map(s => emptyTokens.includes(s) ? "" : s);
        if (!grammar[lhs]) grammar[lhs] = [];
        grammar[lhs].push(...rhs);
    }
    for (let k in grammar) grammar[k] = [...new Set(grammar[k])];
    return grammar;
}

function deepCopy(obj) { return JSON.parse(JSON.stringify(obj)); }

function renderGrammarStandardFormat(grammar) {
    let ht = '';
    const keys = Object.keys(grammar).sort();
    if (keys.length === 0) return '<p style="padding:10px;text-align:center;color:gray;">Empty grammar</p>';
    for (const lhs of keys) {
        const rhsList = grammar[lhs];
        const displayRhs = rhsList.map(prod => prod === '' ? '?' : prod).join(' <span class="pipe">|</span> ');
        ht += `<div class="grammar-rule">
            <span class="rule-lhs">${lhs}</span>
            <span class="rule-arrow">→</span>
            <span class="rule-rhs">${displayRhs}</span>
        </div>`;
    }
    return ht;
}

function renderGrammarDiff(beforeGrammar, afterGrammar, context) {
    let ht = '';

    if (context === 'animated') {
        const keys = [...new Set([...Object.keys(beforeGrammar), ...Object.keys(afterGrammar)])].sort();
        if (keys.length === 0) return '<p style="padding:10px;text-align:center;color:gray;">Empty grammar</p>';
        for (const lhs of keys) {
            const beforeRhs = new Set((beforeGrammar[lhs] || []).map(r => r === '' ? '?' : r));
            const afterRhs = new Set((afterGrammar[lhs] || []).map(r => r === '' ? '?' : r));

            const unionRhs = [...new Set([...beforeRhs, ...afterRhs])];
            if (unionRhs.length === 0) continue;

            let tokensHtml = '';
            unionRhs.forEach((r, idx) => {
                const isRemoved = beforeRhs.has(r) && !afterRhs.has(r);
                const isAdded = !beforeRhs.has(r) && afterRhs.has(r);
                const isLast = idx === unionRhs.length - 1;

                const pipeHtml = isLast ? '' : `<span class="pipe">|</span>`;

                if (isRemoved) {
                    tokensHtml += `<span class="token-anim-removed-container"><span class="token-anim-removed">${r}</span>${pipeHtml}</span>`;
                } else if (isAdded) {
                    tokensHtml += `<span class="token-anim-added-container"><span class="token-anim-added">+ ${r}</span>${pipeHtml}</span>`;
                } else {
                    tokensHtml += `<span class="token-kept-container"><span class="token-kept">${r}</span>${pipeHtml}</span>`;
                }
            });

            ht += `<div class="grammar-rule">
                <span class="rule-lhs">${lhs}</span>
                <span class="rule-arrow">→</span>
                <span class="rule-rhs" style="display: flex; flex-wrap: wrap; align-items: center;">${tokensHtml}</span>
            </div>`;
        }
        return ht;
    }

    const renderSource = context === 'before' ? beforeGrammar : afterGrammar;
    const compareSource = context === 'before' ? afterGrammar : beforeGrammar;
    const keys = Object.keys(renderSource).sort();
    if (keys.length === 0) return '<p style="padding:10px;text-align:center;color:gray;">Empty grammar</p>';
    for (const lhs of keys) {
        const sourceRhs = (renderSource[lhs] || []).map(r => r === '' ? '?' : r);
        const compRhs = new Set((compareSource[lhs] || []).map(r => r === '' ? '?' : r));
        let tokens = [];
        sourceRhs.forEach(r => {
            if (context === 'before') {
                tokens.push(!compRhs.has(r) ? `<span class="token-removed">${r}</span>` : `<span class="token-kept">${r}</span>`);
            } else {
                tokens.push(!compRhs.has(r) ? `<span class="token-added">+ ${r}</span>` : `<span class="token-kept">${r}</span>`);
            }
        });
        ht += `<div class="grammar-rule">
            <span class="rule-lhs">${lhs}</span>
            <span class="rule-arrow">→</span>
            <span class="rule-rhs">${tokens.join(' <span class="pipe">|</span> ')}</span>
        </div>`;
    }
    return ht;
}

function buildHtmlLogs(logs) {
    if (!logs || logs.length === 0) return `<div class="log-entry"><p>No changes needed in this stage.</p></div>`;

    const nullableSet = logs.find(l => l.type === "nullable_detection")?.nullable_symbols || [];
    const closures = logs.find(l => l.type === "closure_calculation")?.closure || {};

    return logs.map(log => {
        let conceptLine = '';
        if (log.type === "phase1" || log.type === "phase2") {
            conceptLine = `<div class="concept-line">Symbols not in generating/reachable sets are removed since they cannot contribute to terminal strings.</div>`;
        }

        let details = '';

        // ============ NULLABLE DETECTION ============
        if (log.type === "nullable_detection") {
            details = `<div class="rule-list"><div class="rule-item" style="font-weight:600;">Nullable Set: { ${log.nullable_symbols.join(', ') || 'Ø'} }</div></div>`;
            // Iteration trace
            if (log.iterations && log.iterations.length > 0) {
                details += `<div class="reasoning-trace">`;
                details += `<div class="reasoning-trace-title">Fixed-Point Iteration Trace</div>`;
                for (const iter of log.iterations) {
                    details += `<div class="iteration-block">`;
                    details += `<div class="iteration-header">Iteration ${iter.iteration} — Found: { ${iter.found.join(', ')} }</div>`;
                    for (const step of iter.reasoning_steps) {
                        const methodClass = step.method === 'direct' ? 'method-direct' : 'method-transitive';
                        details += `<div class="reasoning-step ${methodClass}" onclick="this.classList.toggle('show-reasoning')">
                            <span class="reasoning-dot"></span>
                            <div class="reasoning-body">
                                <div class="reasoning-rule">${step.rule_used}</div>
                                <div class="reasoning-text">${step.reason}</div>
                            </div>
                        </div>`;
                    }
                    details += `<div class="iteration-result">Nullable so far: { ${iter.nullable_so_far.join(', ')} }</div>`;
                    details += `</div>`;
                }
                details += `</div>`;
            }

            // ============ PRODUCTION GENERATION ============
        } else if (log.type === "production_generation") {
            const cLine = `<div class="concept-line">Because { ${nullableSet.join(', ') || 'Ø'} } are nullable, for each production with k nullable positions we generate 2<sup>k</sup> − 1 new alternatives.</div>`;
            details = cLine + `<div class="rule-list" style="margin-top: 10px;">` + log.rule_transformations.map(rt => {
                const nullableInfo = rt.nullable_in_production && rt.nullable_in_production.length > 0
                    ? `<div class="nullable-positions">Nullable positions: ${rt.nullable_in_production.map(n => `<span class="pos-badge">${n.symbol}<sub>${n.position}</sub></span>`).join(' ')} → ${rt.total_combinations} combination(s)</div>`
                    : `<div class="nullable-positions" style="color:#666;">No nullable symbols in this production.</div>`;
                return `
                <div class="rule-transform-container" style="margin-bottom: 15px; padding: 12px; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 8px; border-left: 3px solid #666;">
                    <div style="font-weight: 600; color: #fff; margin-bottom: 4px;">Rule: ${rt.original_rule}</div>
                    ${nullableInfo}
                    <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 8px;">
                        ${rt.generated_rules.map(gr => `
                            <div class="rule-item-reasoning ${gr.type === 'original' ? 'kept' : 'addition'}" onclick="this.classList.toggle('show-reasoning')">
                                <div class="rule-main">
                                    <span class="rule-badge ${gr.type}">${gr.type === 'original' ? 'Kept' : 'New'}</span>
                                    <span class="rule-text">${gr.rule}</span>
                                    ${gr.reasoning ? `<span class="reasoning-chevron"></span>` : ''}
                                </div>
                                ${gr.reasoning ? `<div class="reasoning-inline">${gr.reasoning}</div>` : ''}
                            </div>
                        `).join("")}
                    </div>
                </div>`;
            }).join('') + `</div>`;

            // ============ NULL REMOVAL ============
        } else if (log.type === "null_removal") {
            if (log.removed_epsilon_rules && log.removed_epsilon_rules.length > 0) {
                details = `<div class="rule-list">`;
                for (const rr of log.removed_epsilon_rules) {
                    details += `<div class="rule-item-reasoning removal" onclick="this.classList.toggle('show-reasoning')">
                        <div class="rule-main"><span class="rule-badge removal">Removed</span><span class="rule-text">${rr.rule}</span><span class="reasoning-chevron"></span></div>
                        <div class="reasoning-inline">${rr.reasoning}</div>
                    </div>`;
                }
                details += `</div>`;
            }

            // ============ UNIT IDENTIFICATION ============
        } else if (log.type === "unit_identification") {
            const unitReasons = log.identification_reasoning?.filter(r => r.is_unit !== false) || [];
            const nonUnitReasons = log.identification_reasoning?.filter(r => r.is_unit === false) || [];
            details = `<div class="rule-list">`;
            if (unitReasons.length > 0) {
                details += `<div class="reasoning-sub-title" style="color:#f59e0b;">Unit Productions Found</div>`;
                for (const ur of unitReasons) {
                    details += `<div class="rule-item-reasoning removal" onclick="this.classList.toggle('show-reasoning')">
                        <div class="rule-main"><span class="rule-badge unit">Unit</span><span class="rule-text">${ur.rule}</span><span class="reasoning-chevron"></span></div>
                        <div class="reasoning-inline">${ur.reasoning}</div>
                    </div>`;
                }
            }
            if (nonUnitReasons.length > 0) {
                details += `<details class="reasoning-details"><summary class="reasoning-details-summary">Non-unit productions (${nonUnitReasons.length})</summary>`;
                for (const nr of nonUnitReasons) {
                    details += `<div class="rule-item-reasoning kept" onclick="this.classList.toggle('show-reasoning')">
                        <div class="rule-main"><span class="rule-badge kept">OK</span><span class="rule-text">${nr.rule}</span><span class="reasoning-chevron"></span></div>
                        <div class="reasoning-inline">${nr.reasoning}</div>
                    </div>`;
                }
                details += `</details>`;
            }
            details += `</div>`;

            // ============ CLOSURE CALCULATION ============
        } else if (log.type === "closure_calculation") {
            details = `<div class="rule-list">`;
            // Show final closures
            if (log.closure) {
                for (const k in log.closure) {
                    details += `<div class="rule-item" style="color:#5eead4;">D(${k}) = { ${log.closure[k].join(', ')} }</div>`;
                }
            }
            // Show closure reasoning iterations
            if (log.closure_reasoning && log.closure_reasoning.length > 0) {
                details += `<div class="reasoning-trace" style="margin-top: 12px;">`;
                details += `<div class="reasoning-trace-title">Closure Construction Trace</div>`;
                for (const iter of log.closure_reasoning) {
                    details += `<div class="iteration-block">`;
                    details += `<div class="iteration-header">${iter.description}</div>`;
                    for (const exp of iter.expansions) {
                        if (exp.new_additions.length > 0) {
                            for (const add of exp.new_additions) {
                                details += `<div class="reasoning-step method-transitive" onclick="this.classList.toggle('show-reasoning')">
                                    <span class="reasoning-dot"></span>
                                    <div class="reasoning-body">
                                        <div class="reasoning-rule">D(${exp.variable}): +${add.added} via ${add.via}</div>
                                        <div class="reasoning-text">${add.reasoning}</div>
                                    </div>
                                </div>`;
                            }
                            details += `<div class="iteration-result">D(${exp.variable}) = { ${exp.closure.join(', ')} }</div>`;
                        }
                    }
                    details += `</div>`;
                }
                details += `</div>`;
            }
            details += `</div>`;

            // ============ UNIT REPLACEMENT ============
        } else if (log.type === "unit_replacement") {
            const cLine = `<div class="concept-line" style="border-left-color: #14b8a6; background: rgba(139, 92, 246, 0.04); color: #5eead4;">Unit productions (A → B) introduce unnecessary indirection. We compute the full derivation closure for each variable and substitute them with direct productions.</div>`;
            details = cLine + `<div class="rule-list" style="margin-top: 10px;">` + log.rule_transformations.map(rt => {
                return `
                <div class="rule-transform-container" style="margin-bottom: 15px; padding: 12px; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 8px; border-left: 3px solid #14b8a6;">
                    <div style="font-weight: 600; color: #fff; margin-bottom: 8px;">Variable: ${rt.non_terminal}</div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        ${rt.removed_units.map(ru => `
                            <div class="rule-item-reasoning removal" onclick="this.classList.toggle('show-reasoning')">
                                <div class="rule-main"><span class="rule-badge removal">Removed</span><span class="rule-text">${ru.rule}</span><span class="reasoning-chevron"></span></div>
                                <div class="reasoning-inline">${ru.reasoning}</div>
                            </div>
                        `).join('')}
                        ${rt.added_productions.map(ap => `
                            <div class="rule-item-reasoning addition" onclick="this.classList.toggle('show-reasoning')">
                                <div class="rule-main"><span class="rule-badge generated">Inherited</span><span class="rule-text">${ap.rule}</span><span class="reasoning-chevron"></span></div>
                                <div class="derivation-chain">${ap.derived_from ? `<span class="chain-label">Chain:</span> <span class="chain-path">${ap.via_unit}</span><span class="chain-arrow">→</span><span class="chain-source">${ap.derived_from}</span>` : ''}</div>
                                <div class="reasoning-inline">${ap.reasoning}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
            }).join('') + `</div>`;

            // ============ PHASE 1 (Productive) ============
        } else if (log.type === "phase1") {
            details = `<div class="rule-list">`;
            // Show iteration trace
            if (log.productive_iterations && log.productive_iterations.length > 0) {
                details += `<div class="reasoning-trace">`;
                details += `<div class="reasoning-trace-title">Generating Set Construction</div>`;
                for (const iter of log.productive_iterations) {
                    details += `<div class="iteration-block">`;
                    details += `<div class="iteration-header">Iteration ${iter.iteration} — Found productive: { ${iter.found.join(', ')} }</div>`;
                    for (const step of iter.reasoning_steps) {
                        const methodClass = step.method === 'direct' ? 'method-direct' : 'method-transitive';
                        details += `<div class="reasoning-step ${methodClass}" onclick="this.classList.toggle('show-reasoning')">
                            <span class="reasoning-dot"></span>
                            <div class="reasoning-body">
                                <div class="reasoning-rule">${step.rule_used}</div>
                                <div class="reasoning-text">${step.reason}</div>
                            </div>
                        </div>`;
                    }
                    details += `<div class="iteration-result">Generating so far: { ${iter.productive_so_far.join(', ')} }</div>`;
                    details += `</div>`;
                }
                details += `</div>`;
            }
            if (log.removed_symbols?.length > 0) details += `<div class="rule-item removal" style="margin-top:10px;">Non-Productive Symbols: { ${log.removed_symbols.join(', ')} }</div>`;
            log.removed_rules?.forEach(rr => {
                details += `<div class="rule-item-reasoning removal" onclick="this.classList.toggle('show-reasoning')">
                    <div class="rule-main"><span class="rule-badge removal">Removed</span><span class="rule-text">${rr.original_rule}</span>${rr.reasoning ? `<span class="reasoning-chevron"></span>` : ''}</div>
                    ${rr.reasoning ? `<div class="reasoning-inline">${rr.reasoning}</div>` : ''}
                </div>`;
            });
            details += `</div>`;

            // ============ PHASE 2 (Reachable) ============
        } else if (log.type === "phase2") {
            details = `<div class="rule-list">`;
            // Show BFS trace
            if (log.bfs_trace && log.bfs_trace.length > 0) {
                details += `<div class="reasoning-trace">`;
                details += `<div class="reasoning-trace-title">BFS Reachability Traversal</div>`;
                for (const step of log.bfs_trace) {
                    details += `<div class="iteration-block">`;
                    details += `<div class="iteration-header">Step ${step.step}: Visit ${step.visiting}</div>`;
                    if (step.discovered.length > 0) {
                        for (const disc of step.discovered) {
                            details += `<div class="reasoning-step method-direct" onclick="this.classList.toggle('show-reasoning')">
                                <span class="reasoning-dot"></span>
                                <div class="reasoning-body">
                                    <div class="reasoning-rule">${disc.via_rule}</div>
                                    <div class="reasoning-text">${disc.reasoning}</div>
                                </div>
                            </div>`;
                        }
                    } else {
                        details += `<div class="reasoning-step method-direct" onclick="this.classList.toggle('show-reasoning')">
                            <span class="reasoning-dot"></span>
                            <div class="reasoning-body">
                                <div class="reasoning-text">${step.reasoning}</div>
                            </div>
                        </div>`;
                    }
                    details += `<div class="iteration-result">Reachable so far: { ${step.reachable_so_far.join(', ')} }</div>`;
                    details += `</div>`;
                }
                details += `</div>`;
            }
            if (log.removed_symbols?.length > 0) details += `<div class="rule-item removal" style="margin-top:10px;">Unreachable Symbols: { ${log.removed_symbols.join(', ')} }</div>`;
            log.removed_rules?.forEach(rr => {
                details += `<div class="rule-item-reasoning removal" onclick="this.classList.toggle('show-reasoning')">
                    <div class="rule-main"><span class="rule-badge removal">Removed</span><span class="rule-text">${rr.original_rule}</span>${rr.reasoning ? `<span class="reasoning-chevron"></span>` : ''}</div>
                    ${rr.reasoning ? `<div class="reasoning-inline">${rr.reasoning}</div>` : ''}
                </div>`;
            });
            details += `</div>`;

            // ============ SUMMARY ============
        } else if (log.type === "summary-clear") {
            details = `<div class="rule-list"><div class="rule-item addition" style="color: #34d399; font-weight: bold; padding: 10px; border-left: 3px solid #34d399; background: rgba(52, 211, 153, 0.1);">VALIDATION PASSED</div></div>`;
        } else if (log.type === "summary-warning") {
            details = `<div class="rule-list"><div class="rule-item removal" style="color: #f87171; font-weight: bold; padding: 10px; border-left: 3px solid #f87171; background: rgba(248, 113, 113, 0.1);">VALIDATION FAILED</div></div>`;
        }
        return `<div class="log-entry"><h4>${log.title}</h4><p>${log.description}</p>${conceptLine}${details}</div>`;
    }).join('');
}

function renderStats(beforeMetrics, afterMetrics, containerId) {
    const pD = afterMetrics.productions - beforeMetrics.productions;
    const vD = afterMetrics.variables - beforeMetrics.variables;
    const tD = afterMetrics.terminals - beforeMetrics.terminals;
    const fmt = (d) => d > 0 ? `<span class="stat-diff positive">+${d}</span>` : (d < 0 ? `<span class="stat-diff negative">${d}</span>` : `<span class="stat-diff neutral">0</span>`);
    const html = `
        <div class="stat-pill"><span class="stat-label">Productions:</span> <span class="stat-val">${beforeMetrics.productions} → ${afterMetrics.productions}</span> ${fmt(pD)}</div>
        <div class="stat-pill"><span class="stat-label">Variables:</span> <span class="stat-val">${beforeMetrics.variables} → ${afterMetrics.variables}</span> ${fmt(vD)}</div>
        <div class="stat-pill"><span class="stat-label">Terminals:</span> <span class="stat-val">${beforeMetrics.terminals} → ${afterMetrics.terminals}</span> ${fmt(tD)}</div>`;
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = html;
}

function renderSets(sets, stageIdx, containerId) {
    const container = document.getElementById(containerId);
    if (!sets || !container) return;
    let html = '';
    container.classList.add('active');
    if (stageIdx === 1) {
        html += `<div class="set-line"><span class="set-label">Nullable N:</span> { ${sets.nullable?.join(', ') || 'Ø'} }</div>`;
    } else if (stageIdx === 2) {
        html += `<div class="set-line"><span class="set-label">Derivation Closures:</span></div>`;
        for (let k in sets.closures) html += `<div class="set-line" style="margin-left:15px; font-size: 0.9rem;">D(${k}) = { ${sets.closures[k].join(', ')} }</div>`;
    } else if (stageIdx === 3 || stageIdx === 4) {
        html += `<div class="set-line"><span class="set-label">Generating G:</span> { ${sets.generating?.join(', ') || 'Ø'} }</div>`;
        html += `<div class="set-line"><span class="set-label">Reachable R:</span> { ${sets.reachable?.join(', ') || 'Ø'} }</div>`;
    }
    container.innerHTML = html;
}

// --- Graphs ---

function renderGrammarDiffGraph(beforeGrammar, afterGrammar, container, sets = {}, stageIdx = 0) {
    if (!window.vis || !container) return;
    container.innerHTML = '';

    const getAnalysis = (g) => {
        const nodes = new Set();
        const prods = [];
        for (let lhs in g) {
            nodes.add(lhs);
            for (let rhs of g[lhs]) {
                if (rhs === '') { nodes.add('?'); }
                const isUnit = rhs.length === 1 && isVar(rhs);
                prods.push({ lhs, rhs, isUnit });
                for (let i = 0; i < rhs.length; i++) {
                    const char = rhs[i];
                    if (char !== ' ' && char !== '|') {
                        nodes.add(char);
                        if (!isVar(char)) { /* terminal node */ }
                    }
                }
            }
        }
        return { nodes, prods };
    };

    const bA = getAnalysis(beforeGrammar);
    const aA = getAnalysis(afterGrammar);
    const visNodes = new vis.DataSet();
    const visEdges = new vis.DataSet();
    const allNodeIds = new Set([...bA.nodes, ...aA.nodes]);

    allNodeIds.forEach(id => {
        const status = !bA.nodes.has(id) ? 'added' : (!aA.nodes.has(id) ? 'removed' : 'kept');
        const isTerm = !isVar(id) && id !== '?';

        let color = '#4a5568', borderColor = '#111', opacity = 1;

        // Node role highlighting
        if (stageIdx === 1 && sets.nullable?.includes(id)) { color = '#fbbf24'; borderColor = '#f59e0b'; } // Nullable

        if (stageIdx === 3 || stageIdx === 4) {
            if (sets.generating && sets.generating.includes(id)) { color = '#34d399'; borderColor = '#059669'; } // Generating
            else if (sets.generating && !isTerm) { color = '#f87171'; borderColor = '#ef4444'; } // Non-generating

            if (sets.reachable && !sets.reachable.includes(id)) { color = '#94a3b8'; borderColor = '#475569'; } // Unreachable
        }

        if (id === 'S') color = '#10b981'; // Green for Start
        if (id === '?') color = '#6b7280';

        if (status === 'added') { color = 'rgba(16,185,129, 0.4)'; borderColor = '#34d399'; opacity = 0.9; }
        if (status === 'removed') { color = 'rgba(239, 68, 68, 0.2)'; borderColor = '#ef4444'; opacity = 0.3; }

        visNodes.add({
            id, label: id,
            color: { background: color, border: borderColor, highlight: { background: color, border: '#fff' } },
            shape: isTerm ? 'box' : 'circle',
            opacity: opacity,
            font: { color: getNodeFontColor(), size: 14, strokeWidth: 1, strokeColor: getNodeFontStroke() }
        });
    });

    const edgeMap = new Map();
    const processEdges = (analysis, status) => {
        analysis.prods.forEach(p => {
            const rhs = p.rhs === '' ? '?' : p.rhs;
            for (let i = 0; i < rhs.length; i++) {
                const char = rhs[i];
                if (char === ' ' || char === '|') continue;
                const edgeKey = `${p.lhs}->${char}`;
                const existing = edgeMap.get(edgeKey);
                if (!existing) {
                    edgeMap.set(edgeKey, { from: p.lhs, to: char, isUnit: p.isUnit, status });
                } else if (status === 'added' && existing.status === 'removed') {
                    existing.status = 'kept';
                }
            }
        });
    };

    processEdges(bA, 'removed');
    processEdges(aA, 'added');

    edgeMap.forEach((e, key) => {
        let edgeColor = '#666', width = 1.5, dashes = false;
        if (e.status === 'added') { edgeColor = '#34d399'; width = 2.5; }
        if (e.status === 'removed') { edgeColor = '#ef4444'; width = 1.5; dashes = true; }
        if (e.isUnit && e.status !== 'removed') { edgeColor = '#14b8a6'; width = 2.5; } // Violet unit edges

        visEdges.add({
            id: key, from: e.from, to: e.to, arrows: 'to',
            color: { color: edgeColor, highlight: '#fff' },
            width: width,
            dashes: dashes,
            label: e.isUnit && e.status === 'kept' ? 'unit' : '',
            font: { color: '#14b8a6', size: 10, strokeWidth: 2, strokeColor: '#000' }
        });
    });

    const network = new vis.Network(container, { nodes: visNodes, edges: visEdges }, {
        physics: { stabilization: true },
        interaction: { hover: true, tooltipDelay: 200 }
    });

    if (stageIdx === 3 && sets.closures) {
        network.on("hoverNode", (params) => {
            const node = params.node;
            const reachable = sets.closures[node] || [];
            const edgeUpdates = [];
            visEdges.forEach(edge => {
                if (reachable.includes(edge.from) && reachable.includes(edge.to) && edge.font) {
                    edgeUpdates.push({ id: edge.id, width: 5, color: '#14b8a6' });
                }
            });
            visEdges.update(edgeUpdates);
        });
        network.on("blurNode", () => {
            const edgeResets = [];
            visEdges.forEach(edge => {
                if (edge.font) edgeResets.push({ id: edge.id, width: 2.5, color: '#14b8a6' });
            });
            visEdges.update(edgeResets);
        });
    }

    networkInstances[container.id] = network;
}

// --- Pipeline Control ---

function areGrammarsEqual(g1, g2) {
    const keys1 = Object.keys(g1).sort();
    const keys2 = Object.keys(g2).sort();
    if (keys1.length !== keys2.length) return false;
    for (let i = 0; i < keys1.length; i++) {
        if (keys1[i] !== keys2[i]) return false;
        const k = keys1[i];
        const arr1 = [...g1[k]].sort();
        const arr2 = [...g2[k]].sort();
        if (arr1.length !== arr2.length) return false;
        for (let j = 0; j < arr1.length; j++) {
            if (arr1[j] !== arr2[j]) return false;
        }
    }
    return true;
}

function runFullPipeline() {
    const initG = parseGrammar(DOM.cfgInput.value);
    const s0 = { stageName: "Original", grammar: initG, metrics: _calculate_metrics(initG) };

    // Correct algorithmic order
    const s1 = remove_null_productions(deepCopy(initG));
    const s2 = remove_unit_productions(deepCopy(s1.grammar));
    const s3 = remove_useless_symbols(deepCopy(s2.grammar), "Useless Symbols Removal");

    // Validation pass
    let v_grammar = deepCopy(s3.grammar);
    v_grammar = remove_null_productions(v_grammar).grammar;
    v_grammar = remove_unit_productions(v_grammar).grammar;
    v_grammar = remove_useless_symbols(v_grammar).grammar;

    const isStable = areGrammarsEqual(s3.grammar, v_grammar);

    // Summary stage to maintain 4-stage UI
    const s4 = {
        ...s3,
        stageName: "Validation Check",
        step_logs: [{
            title: isStable ? "Validation Passed: Grammar is Stable" : "Validation Warning: Grammar is Unstable",
            description: isStable ?
                "CLEAR: The rigorous mathematical validation has completed. Re-running the entire normalization pipeline on this output yielded no further reductions. The grammar is perfectly stable and minimized." :
                "WARNING: The grammar required further reductions on a second pass. This indicates cyclic anomalies or unhandled edge cases.",
            type: isStable ? "summary-clear" : "summary-warning"
        }]
    };

    pipelineHistory = [s0, s1, s2, s3, s4];
}

function processAllStepsAndRender() {
    const initG = parseGrammar(DOM.cfgInput.value);
    if (!initG['S']) { alert("Error: Start symbol 'S' is missing!"); return; }
    DOM.pipelineResults.classList.remove('hidden');
    DOM.navigator.classList.add('visible');
    runFullPipeline();
    DOM.btnExportReport.style.display = 'inline-block';

    for (let i = 1; i <= 4; i++) {
        const stage = pipelineHistory[i], prev = pipelineHistory[i - 1], dm = DOM.stages[i - 1];
        dm.logs.innerHTML = buildHtmlLogs(stage.step_logs || stage.logs);
        if (dm.before) dm.before.innerHTML = renderGrammarDiff(prev.grammar, stage.grammar, 'before');
        if (dm.after) dm.after.innerHTML = renderGrammarDiff(prev.grammar, stage.grammar, 'after');
        renderStats(prev.metrics, stage.metrics, dm.stats);
        renderSets(stage.stage_sets || stage.sets, i, dm.sets);
    }

    setTimeout(() => {
        for (let i = 1; i <= 4; i++) {
            const stage = pipelineHistory[i], prev = pipelineHistory[i - 1];
            renderGrammarDiffGraph(prev.grammar, stage.grammar, DOM.stages[i - 1].network, stage.stage_sets || stage.sets, i);
        }
        currentPlaybackStage = 0;
        updateDynamicPlayback();
    }, 200);
    DOM.pipelineResults.scrollIntoView({ behavior: 'smooth' });
}

// --- Intersection Observer & Navigator ---

const observerOptions = { threshold: 0.3 };
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const targetId = entry.target.id;
            DOM.navItems.forEach(item => {
                item.classList.toggle('active', item.dataset.target === targetId);
            });
        }
    });
}, observerOptions);

document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el));

window.addEventListener('scroll', () => {
    const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = (winScroll / height) * 100;
    DOM.progressBar.style.width = scrolled + "%";
});

DOM.navItems.forEach(item => {
    item.addEventListener('click', () => {
        const target = document.getElementById(item.dataset.target);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
});

// --- UI Listeners ---

DOM.btnStart.addEventListener('click', processAllStepsAndRender);
DOM.exampleSelect.addEventListener('change', () => {
    if (DOM.exampleSelect.value) {
        DOM.cfgInput.value = EXAMPLES[DOM.exampleSelect.value] || EXAMPLES.general;
    }
});
DOM.btnClear.addEventListener('click', () => {
    DOM.cfgInput.value = '';
    DOM.exampleSelect.value = '';
    DOM.pipelineResults.classList.add('hidden');
    DOM.navigator.classList.remove('visible');
});

DOM.btnAddRule.addEventListener('click', () => {
    const lhs = DOM.builderLhs.value.trim().toUpperCase(), rhs = DOM.builderRhs.value.trim();
    if (!lhs || !rhs) return;
    DOM.cfgInput.value += (DOM.cfgInput.value && !DOM.cfgInput.value.endsWith('\n') ? '\n' : '') + `${lhs} -> ${rhs}\n`;
    DOM.builderLhs.value = ''; DOM.builderRhs.value = ''; DOM.builderLhs.focus();
});

// Playback
let autoPlayInterval = null;
function updateDynamicPlayback() {
    if (!pipelineHistory.length) return;
    const cur = pipelineHistory[currentPlaybackStage], prev = currentPlaybackStage === 0 ? cur : pipelineHistory[currentPlaybackStage - 1];
    DOM.graphStageLabel.innerText = STAGE_LABELS[currentPlaybackStage];

    // Graph update
    const sets = cur.stage_sets || cur.sets || {};
    renderGrammarDiffGraph(prev.grammar, cur.grammar, DOM.dynamicNetwork, sets, currentPlaybackStage);

    // Stats update (Always compared to Stage 0 initial state for full scope)
    renderStats(pipelineHistory[0].metrics, cur.metrics, 'dynamic-stats');

    // Grammar diff text update
    if (currentPlaybackStage === 0) {
        DOM.dynamicGrammar.innerHTML = renderGrammarStandardFormat(cur.grammar);
    } else {
        DOM.dynamicGrammar.innerHTML = renderGrammarDiff(prev.grammar, cur.grammar, 'animated');
    }

    DOM.btnPrevGraph.disabled = currentPlaybackStage === 0;
    DOM.btnNextGraph.disabled = currentPlaybackStage === STAGE_LABELS.length - 1;
}

DOM.btnPrevGraph.addEventListener('click', () => { if (currentPlaybackStage > 0) { currentPlaybackStage--; updateDynamicPlayback(); } });
DOM.btnNextGraph.addEventListener('click', () => { if (currentPlaybackStage < STAGE_LABELS.length - 1) { currentPlaybackStage++; updateDynamicPlayback(); } });

DOM.btnAutoPlay.addEventListener('click', () => {
    if (autoPlayInterval) {
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
        DOM.btnAutoPlay.innerText = '▶ Auto-Play';
        DOM.btnAutoPlay.style.background = 'var(--feature-accent)';
    } else {
        if (currentPlaybackStage === STAGE_LABELS.length - 1) currentPlaybackStage = 0;
        updateDynamicPlayback();
        DOM.btnAutoPlay.innerText = '⏸ Pause';
        DOM.btnAutoPlay.style.background = 'var(--danger)';

        autoPlayInterval = setInterval(() => {
            if (currentPlaybackStage < STAGE_LABELS.length - 1) {
                currentPlaybackStage++;
                updateDynamicPlayback();
            } else {
                clearInterval(autoPlayInterval);
                autoPlayInterval = null;
                DOM.btnAutoPlay.innerText = '▶ Auto-Play';
                DOM.btnAutoPlay.style.background = 'var(--feature-accent)';
            }
        }, 3000);
    }
});

// =================== STEP-BY-STEP MODE ===================

const SBS = {
    view: document.getElementById('sbs-view'),
    network: document.getElementById('sbs-network'),
    carousel: document.getElementById('sbs-carousel'),
    stageLabel: document.getElementById('sbs-stage-label'),
    counter: document.getElementById('sbs-counter'),
    progressFill: document.getElementById('sbs-progress-fill'),
    btnPrev: document.getElementById('btn-sbs-prev'),
    btnNext: document.getElementById('btn-sbs-next'),
    btnAuto: document.getElementById('btn-sbs-auto'),
    btnExit: document.getElementById('btn-sbs-exit'),
    btnEnter: document.getElementById('btn-step-by-step'),
    grammarContent: document.getElementById('sbs-grammar-content'),
};

let sbsSteps = [];
let sbsCurrentStep = 0;
let sbsAutoInterval = null;
let sbsVisNodes = null;
let sbsVisEdges = null;
let sbsNetworkInstance = null;

function flattenPipelineSteps() {
    const steps = [];
    let runningGrammar = deepCopy(pipelineHistory[0].grammar);
    const STAGE_COLORS = { 1: '#10b981', 2: '#14b8a6', 3: '#f59e0b', 4: '#10b981' };
    const STAGE_NAMES = { 1: 'Null Productions', 2: 'Unit Productions', 3: 'Useless Symbols', 4: 'Validation Pass' };
    const STAGE_DESCS = {
        1: 'Nullable variables are identified and alternative productions are generated. Then all \u03b5-productions are removed.',
        2: 'Unit productions (A \u2192 B) are replaced with non-unit productions reachable through the derivation closure.',
        3: 'Non-productive and unreachable symbols are identified and removed from the grammar.',
        4: 'The grammar undergoes a validation sweep to ensure mathematical convergence and minimality.'
    };

    steps.push({
        stage: 'Original Grammar', stageIdx: 0, color: '#94a3b8',
        action: 'info', title: 'Original Grammar',
        rule: Object.keys(runningGrammar).map(k => `${k} \u2192 ${runningGrammar[k].map(r => r || '\u03b5').join(' | ')}`).join('\n'),
        reasoning: 'This is the starting grammar before any simplification is applied.',
        grammarBefore: deepCopy(runningGrammar), grammarAfter: deepCopy(runningGrammar),
    });

    for (let si = 1; si <= 3; si++) {
        const stage = pipelineHistory[si];
        const prevGrammar = pipelineHistory[si - 1].grammar;
        const afterGrammar = stage.grammar;
        const color = STAGE_COLORS[si];
        const stageName = `Stage ${si}: ${STAGE_NAMES[si]}`;

        const removals = [], additions = [];
        for (const lhs in prevGrammar) {
            for (const rhs of prevGrammar[lhs]) {
                if (!afterGrammar[lhs] || !afterGrammar[lhs].includes(rhs))
                    removals.push({ lhs, rhs });
            }
        }
        for (const lhs in afterGrammar) {
            for (const rhs of afterGrammar[lhs]) {
                if (!prevGrammar[lhs] || !prevGrammar[lhs].includes(rhs))
                    additions.push({ lhs, rhs });
            }
        }

        if (additions.length === 0 && removals.length === 0) {
            steps.push({
                stage: stageName, stageIdx: si, color, action: 'info',
                title: `${stageName} \u2014 No Changes`, rule: 'No modifications needed in this stage.',
                reasoning: STAGE_DESCS[si],
                grammarBefore: deepCopy(runningGrammar), grammarAfter: deepCopy(runningGrammar),
            });
            continue;
        }

        steps.push({
            stage: stageName, stageIdx: si, color, action: 'info',
            title: stageName,
            rule: `${additions.length} addition${additions.length !== 1 ? 's' : ''}, ${removals.length} removal${removals.length !== 1 ? 's' : ''}`,
            reasoning: STAGE_DESCS[si],
            grammarBefore: deepCopy(runningGrammar), grammarAfter: deepCopy(runningGrammar),
        });

        for (const add of additions) {
            const before = deepCopy(runningGrammar);
            if (!runningGrammar[add.lhs]) runningGrammar[add.lhs] = [];
            if (!runningGrammar[add.lhs].includes(add.rhs)) runningGrammar[add.lhs].push(add.rhs);
            steps.push({
                stage: stageName, stageIdx: si, color, action: 'added',
                title: 'Production Added', rule: `${add.lhs} \u2192 ${add.rhs || '\u03b5'}`,
                reasoning: findStepReasoning(stage, add.lhs, add.rhs, 'added'),
                grammarBefore: before, grammarAfter: deepCopy(runningGrammar),
                targetLhs: add.lhs, targetRhs: add.rhs
            });
        }

        for (const rm of removals) {
            const before = deepCopy(runningGrammar);
            if (runningGrammar[rm.lhs]) {
                runningGrammar[rm.lhs] = runningGrammar[rm.lhs].filter(r => r !== rm.rhs);
                if (runningGrammar[rm.lhs].length === 0) delete runningGrammar[rm.lhs];
            }
            steps.push({
                stage: stageName, stageIdx: si, color, action: 'removed',
                title: 'Production Removed', rule: `${rm.lhs} \u2192 ${rm.rhs || '\u03b5'}`,
                reasoning: findStepReasoning(stage, rm.lhs, rm.rhs, 'removed'),
                grammarBefore: before, grammarAfter: deepCopy(runningGrammar),
                targetLhs: rm.lhs, targetRhs: rm.rhs
            });
        }
    }

    steps.push({
        stage: 'Complete', stageIdx: 4, color: '#10b981', action: 'complete',
        title: 'Simplification Complete',
        rule: Object.keys(runningGrammar).map(k => `${k} \u2192 ${runningGrammar[k].map(r => r || '\u03b5').join(' | ')}`).join('\n'),
        reasoning: 'All null productions, unit productions, and useless symbols have been eliminated. The grammar is fully simplified and has passed the convergence validation pass.',
        grammarBefore: deepCopy(runningGrammar), grammarAfter: deepCopy(runningGrammar),
    });

    return steps;
}

function findStepReasoning(stage, lhs, rhs, action) {
    const displayRhs = rhs || '\u03b5';
    const ruleStr = `${lhs} \u2192 ${displayRhs}`;
    for (const log of (stage.step_logs || [])) {
        if (log.type === 'production_generation' && log.rule_transformations && action === 'added') {
            for (const rt of log.rule_transformations) {
                for (const gr of rt.generated_rules) {
                    if (gr.rule === ruleStr) return gr.reasoning || gr.reason || '';
                }
            }
        }
        if (log.type === 'null_removal' && log.removed_epsilon_rules && action === 'removed') {
            for (const rr of log.removed_epsilon_rules) {
                if (rr.rule === ruleStr) return rr.reasoning || '';
            }
        }
        if (log.type === 'unit_replacement' && log.rule_transformations) {
            for (const rt of log.rule_transformations) {
                if (action === 'removed') for (const ru of rt.removed_units) { if (ru.rule === ruleStr) return ru.reasoning || ''; }
                if (action === 'added') for (const ap of rt.added_productions) { if (ap.rule === ruleStr) return ap.reasoning || ''; }
            }
        }
        if ((log.type === 'phase1' || log.type === 'phase2') && log.removed_rules && action === 'removed') {
            for (const rr of log.removed_rules) {
                if (rr.original_rule === ruleStr) return rr.reasoning || '';
            }
        }
    }
    return '';
}

// --- SBS Graph (persistent vis.js DataSets for smooth morphing) ---

function initSbsNetwork() {
    if (sbsNetworkInstance) { sbsNetworkInstance.destroy(); sbsNetworkInstance = null; }
    sbsVisNodes = new vis.DataSet();
    sbsVisEdges = new vis.DataSet();
    sbsNetworkInstance = new vis.Network(SBS.network, { nodes: sbsVisNodes, edges: sbsVisEdges }, {
        physics: {
            enabled: true,
            solver: 'forceAtlas2Based',
            forceAtlas2Based: {
                gravitationalConstant: -150,
                springConstant: 0.03,
                springLength: 120,
                damping: 0.8,
                avoidOverlap: 0.5
            },
            stabilization: { enabled: false }
        },
        interaction: { hover: true, tooltipDelay: 200 },
        edges: { smooth: { type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.4 } }
    });
}

function updateSbsGraph(step) {
    const grammar = step.grammarAfter;
    const prevGrammar = step.grammarBefore;

    // Build desired nodes/edges from afterGrammar
    const desiredNodes = new Map();
    const desiredEdges = new Map();

    for (const lhs in grammar) {
        desiredNodes.set(lhs, { id: lhs, isVar: true });
        for (const rhs of grammar[lhs]) {
            if (rhs === '') {
                desiredNodes.set('\u03b5', { id: '\u03b5', isVar: false });
                desiredEdges.set(`${lhs}->\u03b5`, { from: lhs, to: '\u03b5' });
            } else {
                for (const ch of rhs) {
                    if (ch !== ' ' && ch !== '|') {
                        desiredNodes.set(ch, { id: ch, isVar: isVar(ch) });
                        const ek = `${lhs}->${ch}`;
                        if (!desiredEdges.has(ek)) desiredEdges.set(ek, { from: lhs, to: ch });
                    }
                }
            }
        }
    }

    // Also detect nodes/edges being removed (in prev but not in after) for red ghosting
    const ghostNodes = new Set();
    const ghostEdges = new Map();
    for (const lhs in prevGrammar) {
        if (!grammar[lhs]) ghostNodes.add(lhs);
        for (const rhs of prevGrammar[lhs]) {
            if (rhs === '') {
                if (!grammar[lhs] || !grammar[lhs].includes('')) {
                    ghostEdges.set(`${lhs}->\u03b5`, { from: lhs, to: '\u03b5' });
                    if (!desiredNodes.has('\u03b5')) ghostNodes.add('\u03b5');
                }
            } else {
                for (const ch of rhs) {
                    if (ch !== ' ' && ch !== '|') {
                        const ek = `${lhs}->${ch}`;
                        if (!desiredEdges.has(ek) && !ghostEdges.has(ek)) {
                            ghostEdges.set(ek, { from: lhs, to: ch });
                        }
                    }
                }
            }
        }
    }

    // Determine newly added nodes/edges (in after but not in prev)
    const addedEdges = new Set();
    for (const [ek] of desiredEdges) {
        // Check if this edge existed before
        let existed = false;
        const parts = ek.split('->');
        if (prevGrammar[parts[0]]) {
            for (const rhs of prevGrammar[parts[0]]) {
                const target = parts[1] === '\u03b5' ? '' : parts[1];
                if (rhs === '' && parts[1] === '\u03b5') { existed = true; break; }
                if (rhs.includes(target) && parts[1] !== '\u03b5') { existed = true; break; }
            }
        }
        if (!existed) addedEdges.add(ek);
    }

    const currentNodeIds = new Set(sbsVisNodes.getIds());
    const currentEdgeIds = new Set(sbsVisEdges.getIds());

    // Check if target nodes/edges are part of the current step
    const targetLhs = step.targetLhs;
    const targetRhs = step.targetRhs;
    const targetNodes = new Set();
    const targetEdges = new Set();

    if (targetLhs && targetRhs !== undefined) {
        targetNodes.add(targetLhs);
        if (targetRhs === '') {
            targetNodes.add('\u03b5');
            targetEdges.add(`${targetLhs}->\u03b5`);
        } else {
            for (const ch of targetRhs) {
                if (ch !== ' ' && ch !== '|') {
                    targetNodes.add(ch);
                    targetEdges.add(`${targetLhs}->${ch}`);
                }
            }
        }
    }

    // Add/update desired nodes
    for (const [id, nodeInfo] of desiredNodes) {
        let color = '#4a5568', border = '#222';

        // Highlight coloring
        if (targetNodes.has(id)) {
            color = step.action === 'added' ? '#10b981' : (step.action === 'removed' ? '#ef4444' : '#f59e0b');
            border = '#fff';
        } else if (id === 'S') {
            color = '#10b981'; border = '#059669';
        } else if (!nodeInfo.isVar && id !== '\u03b5') {
            color = '#6b7280'; border = '#374151';
        } else if (id === '\u03b5') {
            color = '#6b7280'; border = '#374151';
        }

        const nodeData = {
            id, label: id,
            color: { background: color, border, highlight: { background: color, border: isLightMode() ? '#1e293b' : '#fff' } },
            shape: (!nodeInfo.isVar || id === '\u03b5') ? 'box' : 'circle',
            opacity: 1,
            borderWidth: targetNodes.has(id) ? 3 : 1,
            shadow: targetNodes.has(id) ? { enabled: true, color: color, size: 15, x: 0, y: 0 } : false,
            font: { color: getNodeFontColor(), size: targetNodes.has(id) ? 20 : 16, strokeWidth: 1, strokeColor: getNodeFontStroke() }
        };

        if (currentNodeIds.has(id)) { sbsVisNodes.update(nodeData); }
        else { sbsVisNodes.add(nodeData); }
        currentNodeIds.delete(id);
    }

    // Ghost removed nodes (red, fading)
    if (step.action === 'removed') {
        for (const id of ghostNodes) {
            if (!desiredNodes.has(id)) {
                const nodeData = {
                    id, label: id,
                    color: { background: 'rgba(239,68,68,0.3)', border: '#ef4444', highlight: { background: 'rgba(239,68,68,0.3)', border: '#ef4444' } },
                    opacity: 0.4,
                    font: { color: '#f87171', size: 16, strokeWidth: 1, strokeColor: getNodeFontStroke() }
                };
                if (currentNodeIds.has(id)) sbsVisNodes.update(nodeData);
                else sbsVisNodes.add(nodeData);
                currentNodeIds.delete(id);
                // Remove after delay
                setTimeout(() => { try { sbsVisNodes.remove(id); } catch (e) { } }, 800);
            }
        }
    }

    // Remove nodes that shouldn't exist
    for (const id of currentNodeIds) {
        sbsVisNodes.remove(id);
    }

    // Add/update desired edges
    for (const [ek, edge] of desiredEdges) {
        let edgeColor = '#555', width = 1.5;
        let dashes = false;

        if (targetEdges.has(ek)) {
            edgeColor = step.action === 'added' ? '#10b981' : (step.action === 'removed' ? '#ef4444' : '#f59e0b');
            width = 4;
            if (step.action === 'removed') dashes = true;
        } else if (addedEdges.has(ek)) {
            edgeColor = '#10b981'; width = 2;
        }

        const edgeData = {
            id: ek, from: edge.from, to: edge.to, arrows: 'to',
            color: { color: edgeColor, highlight: '#fff' }, width, dashes,
            shadow: targetEdges.has(ek) ? { enabled: true, color: edgeColor, size: 8, x: 0, y: 0 } : false,
            font: { color: '#666', size: 10, strokeWidth: 2, strokeColor: '#000' }
        };

        if (currentEdgeIds.has(ek)) sbsVisEdges.update(edgeData);
        else sbsVisEdges.add(edgeData);
        currentEdgeIds.delete(ek);
    }

    // Ghost removed edges
    if (step.action === 'removed') {
        for (const [ek, edge] of ghostEdges) {
            if (!desiredEdges.has(ek)) {
                const edgeData = {
                    id: ek, from: edge.from, to: edge.to, arrows: 'to',
                    color: { color: '#ef4444', highlight: '#ef4444' }, width: 2, dashes: true,
                };
                if (currentEdgeIds.has(ek)) sbsVisEdges.update(edgeData);
                else sbsVisEdges.add(edgeData);
                currentEdgeIds.delete(ek);
                setTimeout(() => { try { sbsVisEdges.remove(ek); } catch (e) { } }, 800);
            }
        }
    }

    // Remove remaining stale edges
    for (const id of currentEdgeIds) {
        sbsVisEdges.remove(id);
    }
}

// --- SBS Carousel ---

function initSbsCarousel() {
    const actionClasses = {
        'info': 'sbs-action-info', 'added': 'sbs-action-added',
        'removed': 'sbs-action-removed', 'complete': 'sbs-action-complete'
    };
    const actionLabels = {
        'info': 'INFO', 'added': 'ADDED', 'removed': 'REMOVED', 'complete': 'DONE'
    };

    const cards = sbsSteps.map((step, idx) => {
        const colorRgb = hexToRgb(step.color || '#ffffff');

        return `<div class="sbs-step ${actionClasses[step.action] || ''}" id="sbs-step-card-${idx}" style="--step-color: ${step.color}; --step-color-rgb: ${colorRgb};">
            <div class="sbs-step-badge" style="background: ${step.color}22; color: ${step.color};">${actionLabels[step.action] || step.action.toUpperCase()}</div>
            <div class="sbs-step-rule">${step.rule.includes('\n') ? step.rule.split('\n').map(l => `<div>${l}</div>`).join('') : step.rule}</div>
            ${step.reasoning ? `<div class="sbs-step-reasoning">${step.reasoning}</div>` : ''}
            <div class="sbs-step-stage">${step.stage}</div>
        </div>`;
    }).join('');
    SBS.carousel.innerHTML = cards;
}

function updateSbsCarousel() {
    // Update classes efficiently instead of rebuilding the DOM
    const children = SBS.carousel.children;
    for (let i = 0; i < children.length; i++) {
        const card = children[i];
        card.classList.remove('past', 'current', 'future');
        if (i < sbsCurrentStep) card.classList.add('past');
        else if (i === sbsCurrentStep) card.classList.add('current');
        else card.classList.add('future');
    }

    // Scroll current step into view
    requestAnimationFrame(() => {
        const currentCard = SBS.carousel.querySelector('.sbs-step.current');
        if (currentCard) {
            currentCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
}

function updateSbsControls() {
    SBS.btnPrev.disabled = sbsCurrentStep === 0;
    SBS.btnNext.disabled = sbsCurrentStep === sbsSteps.length - 1;
    const step = sbsSteps[sbsCurrentStep];
    SBS.stageLabel.textContent = step.stage;
    SBS.stageLabel.style.color = step.color;
    SBS.counter.textContent = `${sbsCurrentStep + 1} / ${sbsSteps.length}`;
    SBS.progressFill.style.width = `${((sbsCurrentStep) / (sbsSteps.length - 1)) * 100}%`;
    SBS.progressFill.style.background = step.color;

    // Render current grammar state
    const grammarLines = [];
    const grammar = step.grammarAfter;
    for (const lhs in grammar) {
        let lineHTML = `<span style="color:${lhs === 'S' ? '#10b981' : '#14b8a6'};font-weight:600;">${lhs}</span> &rarr; `;
        const rhsItems = grammar[lhs].map(rhs => {
            const displayRhs = rhs || '&epsilon;';
            if (lhs === step.targetLhs && rhs === step.targetRhs) {
                if (step.action === 'added') return `<span style="color:#10b981;font-weight:700;text-shadow: 0 0 8px rgba(16,185,129,0.5);">${displayRhs}</span>`;
                if (step.action === 'removed') return `<span style="color:#ef4444;font-weight:700;text-decoration:line-through;opacity:0.6;">${displayRhs}</span>`;
            }
            return displayRhs;
        });

        // Include removed ghost rhs if needed
        if (step.action === 'removed' && lhs === step.targetLhs && !grammar[lhs].includes(step.targetRhs)) {
            rhsItems.push(`<span style="color:#ef4444;font-weight:700;text-decoration:line-through;opacity:0.6;">${step.targetRhs || '&epsilon;'}</span>`);
        }

        if (rhsItems.length > 0) {
            lineHTML += rhsItems.join(' <span style="color:#666;">|</span> ');
            grammarLines.push(`<div>${lineHTML}</div>`);
        }
    }

    // Ghost removed lhs entirely
    if (step.action === 'removed' && step.targetLhs && !grammar[step.targetLhs]) {
        grammarLines.push(`<div style="color:#ef4444;font-weight:700;text-decoration:line-through;opacity:0.6;"><span style="color:#ef4444;">${step.targetLhs}</span> &rarr; ${step.targetRhs || '&epsilon;'}</div>`);
    }

    SBS.grammarContent.innerHTML = grammarLines.join('') || '<div style="color:#666;font-style:italic;">Empty Grammar</div>';
}

function goToSbsStep(idx) {
    if (idx < 0 || idx >= sbsSteps.length) return;
    sbsCurrentStep = idx;
    updateSbsGraph(sbsSteps[sbsCurrentStep]);
    updateSbsCarousel();
    updateSbsControls();
}

function enterStepByStep() {
    const initG = parseGrammar(DOM.cfgInput.value);
    if (!initG['S']) { alert("Error: Start symbol 'S' is missing!"); return; }

    runFullPipeline();
    sbsSteps = flattenPipelineSteps();
    sbsCurrentStep = 0;

    // Show SBS view, hide main content
    document.querySelector('.container').classList.add('hidden');
    SBS.view.classList.remove('hidden');

    // Init graph & carousel DOM exactly once
    initSbsNetwork();
    initSbsCarousel();
    goToSbsStep(0);
}

function exitStepByStep() {
    if (sbsAutoInterval) { clearInterval(sbsAutoInterval); sbsAutoInterval = null; }
    if (sbsNetworkInstance) { sbsNetworkInstance.destroy(); sbsNetworkInstance = null; }
    SBS.view.classList.add('hidden');
    document.querySelector('.container').classList.remove('hidden');
    SBS.btnAuto.textContent = 'Auto';
    SBS.btnAuto.style.background = 'var(--feature-accent)';
}

// SBS Event Listeners
SBS.btnEnter.addEventListener('click', enterStepByStep);
SBS.btnExit.addEventListener('click', exitStepByStep);
SBS.btnPrev.addEventListener('click', () => goToSbsStep(sbsCurrentStep - 1));
SBS.btnNext.addEventListener('click', () => goToSbsStep(sbsCurrentStep + 1));
SBS.btnAuto.addEventListener('click', () => {
    if (sbsAutoInterval) {
        clearInterval(sbsAutoInterval);
        sbsAutoInterval = null;
        SBS.btnAuto.textContent = 'Auto';
        SBS.btnAuto.style.background = '#10b981';
    } else {
        if (sbsCurrentStep === sbsSteps.length - 1) sbsCurrentStep = 0;
        SBS.btnAuto.textContent = 'Pause';
        SBS.btnAuto.style.background = 'var(--danger)';
        sbsAutoInterval = setInterval(() => {
            if (sbsCurrentStep < sbsSteps.length - 1) {
                goToSbsStep(sbsCurrentStep + 1);
            } else {
                clearInterval(sbsAutoInterval);
                sbsAutoInterval = null;
                SBS.btnAuto.textContent = 'Auto';
                SBS.btnAuto.style.background = 'var(--feature-accent)';
            }
        }, 2000);
    }
});

// Keyboard navigation for SBS mode
document.addEventListener('keydown', (e) => {
    if (SBS.view.classList.contains('hidden')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goToSbsStep(sbsCurrentStep + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goToSbsStep(sbsCurrentStep - 1); }
    if (e.key === 'Escape') exitStepByStep();
});

// --- PDF Report ---

DOM.btnExportReport.addEventListener('click', () => {
    generateReport(pipelineHistory, STAGE_LABELS, networkInstances, DOM.stages);
});

window.populateExample = (type) => { if (EXAMPLES[type]) { DOM.cfgInput.value = EXAMPLES[type]; document.getElementById('step-0').scrollIntoView({ behavior: 'smooth' }); } };

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-reset-graph')) {
        const nid = e.target.getAttribute('data-network');
        if (networkInstances[nid]) networkInstances[nid].fit({ animation: true });
    }
});

// =================== THEME TOGGLE ===================

function initTheme() {
    const saved = localStorage.getItem('cfg-theme');
    if (saved === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    }
}

function toggleTheme() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('cfg-theme', 'dark');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('cfg-theme', 'light');
    }
}

initTheme();
DOM.btnThemeToggle.addEventListener('click', toggleTheme);
