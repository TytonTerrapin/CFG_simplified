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
        if (log.type === "nullable_detection") {
            details = `<div class="rule-list"><div class="rule-item">Nullable: { ${log.nullable_symbols.join(', ')} }</div></div>`;
        } else if (log.type === "production_generation") {
            const cLine = `<div class="concept-line">Because { ${nullableSet.join(', ') || 'Ø'} } are nullable, they can be removed from productions, generating alternative rules.</div>`;
            details = cLine + `<div class="rule-list" style="margin-top: 10px;">` + log.rule_transformations.map(rt => {
                return `
                <div class="rule-transform-container" style="margin-bottom: 15px; padding: 12px; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 8px; border-left: 3px solid #666;">
                    <div style="font-weight: 600; color: #fff; margin-bottom: 8px;">Rule: ${rt.original_rule}</div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        ${rt.generated_rules.map(gr => `
                            <div class="rule-item ${gr.type === 'original' ? 'kept' : 'addition'}" style="padding-left: 10px; border-left: 1px solid #333; font-size: 0.85rem;">
                                <span>${gr.type === 'original' ? 'Kept' : 'Generated'}: ${gr.rule}</span>
                            </div>
                        `).join("")}
                    </div>
                </div>`;
            }).join('') + `</div>`;
        } else if (log.type === "unit_replacement") {
            const cLine = `<div class="concept-line" style="border-left-color: #3b82f6; background: rgba(59, 130, 246, 0.04); color: #93c5fd;">Unit productions (A → B) introduce unnecessary indirection. We compute the full derivation closure for each variable and substitute them with direct productions.</div>`;
            details = cLine + `<div class="rule-list" style="margin-top: 10px;">` + log.rule_transformations.map(rt => {
                return `
                <div class="rule-transform-container" style="margin-bottom: 15px; padding: 12px; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 8px; border-left: 3px solid #3b82f6;">
                    <div style="font-weight: 600; color: #fff; margin-bottom: 8px;">Variable: ${rt.non_terminal}</div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        ${rt.removed_units.map(ru => `<div class="rule-item removal" style="padding-left: 10px; border-left: 1px solid #333; font-size: 0.85rem;">Removed Unit: ${ru}</div>`).join('')}
                        ${rt.added_productions.map(ap => `<div class="rule-item addition" style="padding-left: 10px; border-left: 1px solid #333; font-size: 0.85rem;">Generated: ${ap.rule}</div>`).join('')}
                    </div>
                </div>`;
            }).join('') + `</div>`;
        } else if (log.type === "phase1" || log.type === "phase2") {
            details = `<div class="rule-list">`;
            if (log.removed_symbols?.length > 0) details += `<div class="rule-item removal">Removed Symbols: { ${log.removed_symbols.join(', ')} }</div>`;
            log.removed_rules?.forEach(rr => details += `<div class="rule-item removal">Removed Rule: ${rr.original_rule}</div>`);
            details += `</div>`;
        } else if (log.type === "summary-clear") {
            details = `<div class="rule-list"><div class="rule-item addition" style="color: #34d399; font-weight: bold; padding: 10px; border-left: 3px solid #34d399; background: rgba(52, 211, 153, 0.1);">✓ VALIDATION PASSED</div></div>`;
        } else if (log.type === "summary-warning") {
            details = `<div class="rule-list"><div class="rule-item removal" style="color: #f87171; font-weight: bold; padding: 10px; border-left: 3px solid #f87171; background: rgba(248, 113, 113, 0.1);">⚠ VALIDATION FAILED</div></div>`;
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
    
    const isVar = (s) => s && s.length === 1 && s >= 'A' && s <= 'Z';

    const getAnalysis = (g) => {
        const nodes = new Set();
        const prods = [];
        for (let lhs in g) {
            nodes.add(lhs);
            for (let rhs of g[lhs]) {
                if (rhs === '') { nodes.add('?'); }
                const isUnit = rhs.length === 1 && isVar(rhs);
                prods.push({lhs, rhs, isUnit});
                for (let i = 0; i < rhs.length; i++) {
                    const char = rhs[i];
                    if (char !== ' ' && char !== '|') {
                        nodes.add(char);
                        if (!isVar(char)) { /* terminal node */ }
                    }
                }
            }
        }
        return {nodes, prods};
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

        if (id === 'S') color = '#3b82f6';
        if (id === '?') color = '#6b7280';

        if (status === 'added') { color = 'rgba(16,185,129, 0.4)'; borderColor = '#34d399'; opacity = 0.9; }
        if (status === 'removed') { color = 'rgba(239, 68, 68, 0.2)'; borderColor = '#ef4444'; opacity = 0.3; }

        visNodes.add({
            id, label: id,
            color: { background: color, border: borderColor, highlight: { background: color, border: '#fff' } },
            shape: isTerm ? 'box' : 'circle',
            opacity: opacity,
            font: { color: '#fff', size: 14, strokeWidth: 1, strokeColor: '#000' }
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
        if (e.isUnit && e.status !== 'removed') { edgeColor = '#3b82f6'; width = 2.5; } // Blue unit edges

        visEdges.add({
            id: key, from: e.from, to: e.to, arrows: 'to',
            color: { color: edgeColor, highlight: '#fff' },
            width: width,
            dashes: dashes,
            label: e.isUnit && e.status === 'kept' ? 'unit' : '',
            font: { color: '#3b82f6', size: 10, strokeWidth: 2, strokeColor: '#000' }
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
                    edgeUpdates.push({ id: edge.id, width: 5, color: '#3b82f6' });
                }
            });
            visEdges.update(edgeUpdates);
        });
        network.on("blurNode", () => {
            const edgeResets = [];
            visEdges.forEach(edge => {
                if (edge.font) edgeResets.push({ id: edge.id, width: 2.5, color: '#3b82f6' });
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
                "✓ CLEAR: The rigorous mathematical validation has completed. Re-running the entire normalization pipeline on this output yielded no further reductions. The grammar is perfectly stable and minimized." : 
                "⚠ WARNING: The grammar required further reductions on a second pass. This indicates cyclic anomalies or unhandled edge cases.",
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
        DOM.btnAutoPlay.style.background = '#6366f1';
    } else {
        if (currentPlaybackStage === STAGE_LABELS.length - 1) currentPlaybackStage = 0;
        updateDynamicPlayback();
        DOM.btnAutoPlay.innerText = '⏸ Pause';
        DOM.btnAutoPlay.style.background = '#ef4444';
        
        autoPlayInterval = setInterval(() => {
            if (currentPlaybackStage < STAGE_LABELS.length - 1) {
                currentPlaybackStage++;
                updateDynamicPlayback();
            } else {
                clearInterval(autoPlayInterval);
                autoPlayInterval = null;
                DOM.btnAutoPlay.innerText = '▶ Auto-Play';
                DOM.btnAutoPlay.style.background = '#6366f1';
            }
        }, 3000);
    }
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
