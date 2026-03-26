import { remove_null_productions, remove_unit_productions, remove_useless_symbols } from './logic.js';

const DOM = {
    cfgInput: document.getElementById('cfg-input'),
    btnStart: document.getElementById('btn-start'),
    
    btnLoadExample: document.getElementById('btn-load-example'),
    btnClear: document.getElementById('btn-clear'),
    exampleSelect: document.getElementById('example-select'),
    
    btnAddRule: document.getElementById('btn-add-rule'),
    builderLhs: document.getElementById('builder-lhs'),
    builderRhs: document.getElementById('builder-rhs'),
    
    pipelineResults: document.getElementById('pipeline-results'),
    
    u1Logs: document.getElementById('u1-logs'),
    u1Before: document.getElementById('u1-before'),
    u1After: document.getElementById('u1-after'),
    u1Network: document.getElementById('u1-network'),

    nullLogs: document.getElementById('null-logs'),
    nullBefore: document.getElementById('null-before'),
    nullAfter: document.getElementById('null-after'),
    nullNetwork: document.getElementById('null-network'),
    
    unitLogs: document.getElementById('unit-logs'),
    unitBefore: document.getElementById('unit-before'),
    unitAfter: document.getElementById('unit-after'),
    unitNetwork: document.getElementById('unit-network'),
    
    u2Logs: document.getElementById('u2-logs'),
    u2Before: document.getElementById('u2-before'),
    u2After: document.getElementById('u2-after'),
    u2Network: document.getElementById('u2-network'),
    
    finalOrig: document.getElementById('final-original'),
    finalSimp: document.getElementById('final-simplified'),
    
    // Dynamic Replay
    btnPrevGraph: document.getElementById('btn-prev-graph'),
    btnNextGraph: document.getElementById('btn-next-graph'),
    graphStageLabel: document.getElementById('graph-stage-label'),
    dynamicNetwork: document.getElementById('dynamic-network'),
    // New UI Elements
    btnExportReport: document.getElementById('btn-export-report'),
};

const STAGE_LABELS = [
    "Stage 0: Original Grammar",
    "Stage 1: Initial Useless Symbols Diff",
    "Stage 2: Null Productions Diff",
    "Stage 3: Unit Productions Diff",
    "Stage 4: Final Useless Symbols Diff"
];
let currentPlaybackStage = 0;

const EXAMPLES = {
    general: "S -> ABaC\nA -> BC\nB -> b | ?\nC -> D | ?\nD -> d",
    nulls: "S -> ABC\nA -> a | ?\nB -> b | ?\nC -> c | ?",
    units: "S -> A\nA -> B\nB -> C\nC -> D\nD -> a | b",
    useless: "S -> AB | C\nA -> a\nB -> bA\nC -> cC\nD -> d",
    complex1: "S -> ABCD | EFG\nA -> aA | B | ?\nB -> bB | C | ?\nC -> cC | D | ?\nD -> dD | a | ?\nE -> eE | F\nF -> fF | G\nG -> gG | E | ?\nH -> hH | I\nI -> iI | H | ?\nJ -> KL | M\nK -> kK | ?\nL -> lL | ?\nM -> mM | N\nN -> nN | ?\nO -> p",
    complex2: "S -> XYZ | UVW\nX -> Y | a\nY -> Z | b\nZ -> X | c | ?\nU -> V | d\nV -> W | e\nW -> U | f | ?\nA -> B | C\nB -> D | E\nC -> F | G\nD -> x | ?\nE -> y | ?\nF -> z | ?\nG -> w | ?"
};

let pipelineStates = []; 
const networkInstances = {};

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
        const rhsRaw = rhsRawToken.split('|').map(s => s.trim());
        const rhs = rhsRaw.map(s => emptyTokens.includes(s) ? "" : s);
        
        if (!grammar[lhs]) grammar[lhs] = [];
        grammar[lhs].push(...rhs);
    }
    
    for (let k in grammar) {
        grammar[k] = [...new Set(grammar[k])];
    }
    return grammar;
}

function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function renderGrammarDiff(beforeGrammar, afterGrammar, context) {
    const renderSource = context === 'before' ? beforeGrammar : afterGrammar;
    const compareSource = context === 'before' ? afterGrammar : beforeGrammar;
    
    const keys = Object.keys(renderSource).sort();
    let ht = '';
    if (keys.length === 0) return '<p style="padding:10px;text-align:center;color:gray;">Empty grammar</p>';

    for (const lhs of keys) {
        const sourceRhs = (renderSource[lhs] || []).map(r => r === '' ? '?' : r);
        const compRhs = new Set((compareSource[lhs] || []).map(r => r === '' ? '?' : r));
        
        let tokens = [];
        sourceRhs.forEach(r => {
            if (context === 'before') {
                if (!compRhs.has(r)) {
                    tokens.push(`<span class="token-removed">${r}</span>`);
                } else {
                    tokens.push(`<span class="token-kept">${r}</span>`);
                }
            } else {
                if (!compRhs.has(r)) {
                    tokens.push(`<span class="token-added">+ ${r}</span>`);
                } else {
                    tokens.push(`<span class="token-kept">${r}</span>`);
                }
            }
        });

        ht += `<div class="grammar-rule">
            <span class="rule-lhs" style="width: auto">${lhs}</span>
            <span class="rule-arrow" style="margin: 0 15px;">→</span>
            <span class="rule-rhs">${tokens.join(' <span class="pipe">|</span> ')}</span>
        </div>`;
    }
    return ht;
}

function renderGrammarStandardFormat(grammar) {
    let ht = '';
    const keys = Object.keys(grammar).sort();
    
    if (keys.length === 0) return '<p style="padding:10px;text-align:center;color:gray;">Empty grammar</p>';

    for (const lhs of keys) {
        const rhsList = grammar[lhs];
        const displayRhs = rhsList.map(prod => prod === '' ? '?' : prod).join(' <span class="pipe">|</span> ');
        
        ht += `<div class="grammar-rule">
            <span class="rule-lhs" style="width: auto">${lhs}</span>
            <span class="rule-arrow" style="margin: 0 15px;">→</span>
            <span class="rule-rhs">${displayRhs}</span>
        </div>`;
    }
    return ht;
}

function buildHtmlLogs(logs) {
    if (!logs || logs.length === 0) return `<div class="log-entry"><p>No changes needed in this stage.</p></div>`;
    
    return logs.map(log => {
        let details = '';
        if (log.type === "nullable_detection") {
            details = `<div class="rule-list"><div class="rule-item">Nullable: { ${log.nullable_symbols.join(', ')} }</div></div>`;
        }
        else if (log.type === "production_generation" && log.rule_transformations) {
            details = `<div class="rule-list">` + log.rule_transformations.map(rt => {
                let html = `<div class="rule-item" style="border-bottom:none; padding-bottom:0;"><strong>Rule: ${rt.original_rule}</strong></div>`;
                rt.generated_rules.forEach(gr => {
                    html += `<div class="rule-item ${gr.type === 'original' ? 'kept' : 'addition'}" style="margin-left: 15px;">
                        <span>${gr.type === 'original' ? 'Kept' : 'Generated'}: ${gr.rule}</span>
                        <span style="font-size:0.8em;opacity:0.7">${gr.reason}</span>
                    </div>`;
                });
                return html;
            }).join('<hr style="border:0;border-top:1px dashed #333;margin:4px 0;">') + `</div>`;
        }
        else if (log.type === "unit_identification") {
            let u = [];
            for (let [k,v] of Object.entries(log.unit_productions)) {
                v.forEach(prod => u.push(`${k} → ${prod}`));
            }
            details = `<div class="rule-list"><div class="rule-item removal">Units found: ${u.join(', ')}</div></div>`;
        }
        else if (log.type === "unit_replacement") {
            details = `<div class="rule-list">` + log.rule_transformations.map(rt => {
                let s = "";
                rt.removed_units.forEach(ru => s += `<div class="rule-item removal">Removed unit pair: ${ru}</div>`);
                rt.added_productions.forEach(ap => s += `<div class="rule-item addition">Generated: ${ap.rule} <span style="font-size:0.8em;opacity:0.7">via ${ap.derived_from}</span></div>`);
                return s;
            }).join('<hr style="border:0;border-top:1px dashed #333;margin:4px 0;">') + `</div>`;
        }
        else if (log.type === "phase1" || log.type === "phase2") {
            details = `<div class="rule-list">`;
            if (log.removed_symbols && log.removed_symbols.length > 0) {
                details += `<div class="rule-item removal">Removed Symbols: { ${log.removed_symbols.join(', ')} }</div>`;
            } else {
                details += `<div class="rule-item kept">No symbols removed in this phase</div>`;
            }
            if (log.removed_rules) {
                log.removed_rules.forEach(rr => {
                    details += `<div class="rule-item removal">Removed Rule: ${rr.original_rule} <br><span style="font-size:0.8em;opacity:0.7;display:block;margin-top:2px;">${rr.reason}</span></div>`;
                });
            }
            details += `</div>`;
        }
        return `
            <div class="log-entry">
                <h4>${log.title}</h4>
                <p>${log.description}</p>
                ${details}
            </div>
        `;
    }).join('');
}

function getGrammarStats(grammar) {
    let numProductions = 0;
    let vars = new Set(Object.keys(grammar));
    let terms = new Set();
    
    for (let lhs in grammar) {
        for (let rhs of grammar[lhs]) {
            if (rhs === '') {
                numProductions++;
                continue;
            }
            numProductions++;
            for (let i = 0; i < rhs.length; i++) {
                let char = rhs[i];
                if (char >= 'A' && char <= 'Z') vars.add(char);
                else if (char !== ' ' && char !== '|') terms.add(char);
            }
        }
    }
    return {
        productions: numProductions,
        variables: vars.size,
        terminals: terms.size
    };
}

function renderStats(beforeGrammar, afterGrammar, containerId) {
    const bStats = getGrammarStats(beforeGrammar);
    const aStats = getGrammarStats(afterGrammar);
    
    const pDiff = aStats.productions - bStats.productions;
    const vDiff = aStats.variables - bStats.variables;
    const tDiff = aStats.terminals - bStats.terminals;
    
    function formatDiff(diff) {
        if (diff > 0) return `<span class="stat-diff positive">+${diff}</span>`;
        if (diff < 0) return `<span class="stat-diff negative">${diff}</span>`;
        return `<span class="stat-diff neutral">0</span>`;
    }

    const html = `
        <div class="stat-pill">
            <span class="stat-label">Productions:</span>
            <span class="stat-val">${bStats.productions} → ${aStats.productions}</span>
            ${formatDiff(pDiff)}
        </div>
        <div class="stat-pill">
            <span class="stat-label">Variables:</span>
            <span class="stat-val">${bStats.variables} → ${aStats.variables}</span>
            ${formatDiff(vDiff)}
        </div>
        <div class="stat-pill">
            <span class="stat-label">Terminals:</span>
            <span class="stat-val">${bStats.terminals} → ${aStats.terminals}</span>
            ${formatDiff(tDiff)}
        </div>
    `;
    
    document.getElementById(containerId).innerHTML = html;
}

function renderSets(sets, stage, containerId) {
    const container = document.getElementById(containerId);
    if (!sets || !container) return;
    
    let html = '';
    container.classList.add('active');
    
    if (stage === 1 || stage === 4) {
        let gSet = sets.generating ? sets.generating.join(', ') : 'Ø';
        let rSet = sets.reachable ? sets.reachable.join(', ') : 'Ø';
        html += `<div class="set-line"><span class="set-label">Generating Set (G):</span> { ${gSet} }</div>`;
        html += `<div class="set-line"><span class="set-label">Reachable Set (R):</span> { ${rSet} }</div>`;
    } else if (stage === 2) {
        let nSet = sets.nullable && sets.nullable.length > 0 ? sets.nullable.join(', ') : 'Ø';
        html += `<div class="set-line"><span class="set-label">Nullable Set (N):</span> { ${nSet} }</div>`;
    } else if (stage === 3) {
        html += `<div class="set-line"><span class="set-label">Derivation Closures:</span></div>`;
        for (let k in sets.closures) {
            html += `<div class="set-line" style="margin-left:15px; font-size: 0.95rem;">D(${k}) = { ${sets.closures[k].join(', ')} }</div>`;
        }
    }
    container.innerHTML = html;
}

// Diff Graph network render function
function renderGrammarDiffGraph(beforeGrammar, afterGrammar, container) {
    if (!window.vis || !container) return;
    container.innerHTML = '';
    
    function getDep(grammar) {
        let nodes = new Set();
        let edges = new Set();
        let isTerm = new Set();
        
        for (let lhs in grammar) {
            nodes.add(lhs);
            for (let rhs of grammar[lhs]) {
                if (rhs === '') {
                    nodes.add('?');
                    isTerm.add('?');
                    edges.add(`${lhs}->?`);
                    continue;
                }
                for (let i=0; i<rhs.length; i++) {
                    let char = rhs[i];
                    if (char !== ' ' && char !== '|') {
                        nodes.add(char);
                        edges.add(`${lhs}->${char}`);
                        if (!(char >= 'A' && char <= 'Z')) isTerm.add(char);
                    }
                }
            }
        }
        return { nodes, edges, isTerm };
    }
    
    const bDep = getDep(beforeGrammar);
    const aDep = getDep(afterGrammar);
    
    let allNodes = new Set([...bDep.nodes, ...aDep.nodes]);
    let allEdges = new Set([...bDep.edges, ...aDep.edges]);
    
    const visNodes = new vis.DataSet();
    const visEdges = new vis.DataSet();
    
    if (allNodes.size === 0) {
        container.innerHTML = '<div style="color:var(--text-secondary); display:flex; height:100%; align-items:center; justify-content:center;">No graph to display</div>';
        return;
    }
    
    allNodes.forEach(n => {
        const isTerminal = bDep.isTerm.has(n) || aDep.isTerm.has(n);
        let nodeStatus = 'kept';
        if (!bDep.nodes.has(n)) nodeStatus = 'added';
        if (!aDep.nodes.has(n)) nodeStatus = 'removed';
        
        let color = isTerminal ? '#2d3748' : '#4a5568';
        if (n === 'S') color = '#2b6cb0'; // Start symbol blue
        
        let border = '#111';
        let dashes = false;
        
        if (nodeStatus === 'added') { color = 'rgba(16, 185, 129, 0.4)'; border = '#10b981'; }
        if (nodeStatus === 'removed') { color = 'rgba(239, 68, 68, 0.4)'; border = '#ef4444'; dashes = true; }
        
        visNodes.add({ 
            id: n, 
            label: n, 
            color: { background: color, border: border }, 
            font: { color: 'white', face: 'Fira Code' }, 
            shape: isTerminal ? 'box' : 'circle',
            shapeProperties: { borderDashes: dashes },
            borderWidth: nodeStatus !== 'kept' ? 2 : 1,
            margin: 10
        });
    });
    
    allEdges.forEach(e => {
        let [from, to] = e.split('->');
        let edgeStatus = 'kept';
        if (!bDep.edges.has(e)) edgeStatus = 'added';
        if (!aDep.edges.has(e)) edgeStatus = 'removed';
        
        let color = '#555';
        let dashes = false;
        let width = 1;
        
        if (edgeStatus === 'added') { color = '#10b981'; width = 2.5; }
        if (edgeStatus === 'removed') { color = '#ef4444'; dashes = true; width = 2.5; }
        
        visEdges.add({ 
            from, to, 
            arrows: 'to', 
            color: { color }, 
            dashes, width
        });
    });
    
    const options = {
        interaction: { zoomView: false, dragView: false, dragNodes: true },
        physics: { 
            enabled: true,
            barnesHut: { 
                gravitationalConstant: -3000, 
                centralGravity: 0.4, 
                springLength: 90, 
                springConstant: 0.15, 
                damping: 0.25 
            },
            stabilization: { iterations: 150 }
        },
        layout: { randomSeed: 5 }
    };
    networkInstances[container.id] = new vis.Network(container, {nodes: visNodes, edges: visEdges}, options);
}

// ----------------------------------------
// Pipeline Runner
// ----------------------------------------

function runFullPipeline() {
    const initG = parseGrammar(DOM.cfgInput.value);
    const s1 = remove_useless_symbols(deepCopy(initG));
    const s2 = remove_null_productions(deepCopy(s1.grammar));
    const s3 = remove_unit_productions(deepCopy(s2.grammar));
    const s4 = remove_useless_symbols(deepCopy(s3.grammar));
    
    pipelineStates = [
        { grammar: initG, logs: null, sets: null },
        { grammar: s1.grammar, logs: s1.step_logs, sets: s1.stage_sets },
        { grammar: s2.grammar, logs: s2.step_logs, sets: s2.stage_sets },
        { grammar: s3.grammar, logs: s3.step_logs, sets: s3.stage_sets },
        { grammar: s4.grammar, logs: s4.step_logs, sets: s4.stage_sets },
    ];
}

function processAllStepsAndRender() {
    const initG = parseGrammar(DOM.cfgInput.value);
    if (!initG || Object.keys(initG).length === 0) {
        alert("Error: Grammar is empty. Please enter valid rules.");
        return;
    }
    if (!initG['S']) {
        alert("Error: Start symbol 'S' is missing! The grammar must contain a rule for 'S'.");
        return;
    }

    DOM.pipelineResults.classList.remove('hidden');
    runFullPipeline();
    
    DOM.btnExportReport.style.display = 'inline-block';
    
    // STEP 1: Useless
    DOM.u1Logs.innerHTML = buildHtmlLogs(pipelineStates[1].logs);
    DOM.u1Before.innerHTML = renderGrammarDiff(pipelineStates[0].grammar, pipelineStates[1].grammar, 'before');
    DOM.u1After.innerHTML = renderGrammarDiff(pipelineStates[0].grammar, pipelineStates[1].grammar, 'after');
    renderStats(pipelineStates[0].grammar, pipelineStates[1].grammar, 'u1-stats');

    // STEP 2: Null
    DOM.nullLogs.innerHTML = buildHtmlLogs(pipelineStates[2].logs);
    DOM.nullBefore.innerHTML = renderGrammarDiff(pipelineStates[1].grammar, pipelineStates[2].grammar, 'before');
    DOM.nullAfter.innerHTML = renderGrammarDiff(pipelineStates[1].grammar, pipelineStates[2].grammar, 'after');
    renderStats(pipelineStates[1].grammar, pipelineStates[2].grammar, 'null-stats');
    
    // STEP 3: Unit
    DOM.unitLogs.innerHTML = buildHtmlLogs(pipelineStates[3].logs);
    DOM.unitBefore.innerHTML = renderGrammarDiff(pipelineStates[2].grammar, pipelineStates[3].grammar, 'before');
    DOM.unitAfter.innerHTML = renderGrammarDiff(pipelineStates[2].grammar, pipelineStates[3].grammar, 'after');
    renderStats(pipelineStates[2].grammar, pipelineStates[3].grammar, 'unit-stats');

    // STEP 4: Useless 2
    DOM.u2Logs.innerHTML = buildHtmlLogs(pipelineStates[4].logs);
    DOM.u2Before.innerHTML = renderGrammarDiff(pipelineStates[3].grammar, pipelineStates[4].grammar, 'before');
    DOM.u2After.innerHTML = renderGrammarDiff(pipelineStates[3].grammar, pipelineStates[4].grammar, 'after');
    renderStats(pipelineStates[3].grammar, pipelineStates[4].grammar, 'u2-stats');

    // STEP 5: Final Comparison
    DOM.finalOrig.innerHTML = renderGrammarStandardFormat(pipelineStates[0].grammar);
    DOM.finalSimp.innerHTML = renderGrammarStandardFormat(pipelineStates[4].grammar);
    renderStats(pipelineStates[0].grammar, pipelineStates[4].grammar, 'final-stats');

    setTimeout(() => {
        renderGrammarDiffGraph(pipelineStates[0].grammar, pipelineStates[1].grammar, DOM.u1Network);
        renderGrammarDiffGraph(pipelineStates[1].grammar, pipelineStates[2].grammar, DOM.nullNetwork);
        renderGrammarDiffGraph(pipelineStates[2].grammar, pipelineStates[3].grammar, DOM.unitNetwork);
        renderGrammarDiffGraph(pipelineStates[3].grammar, pipelineStates[4].grammar, DOM.u2Network);
        
        currentPlaybackStage = 0;
        updateDynamicPlayback();
    }, 150);

    // Trigger sequential animations
    const steps = ['step-1', 'step-2', 'step-3', 'step-4', 'step-5'];
    steps.forEach((id) => {
        const el = document.getElementById(id);
        if(el) {
            el.classList.remove('animate-panel');
            void el.offsetWidth; // trigger reflow
            el.classList.add('animate-panel');
        }
    });

    document.getElementById('pipeline-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ----------------------------------------
// Init Handlers
// ----------------------------------------

DOM.btnStart.addEventListener('click', processAllStepsAndRender);

DOM.btnLoadExample.addEventListener('click', () => {
    const sel = DOM.exampleSelect.value;
    DOM.cfgInput.value = EXAMPLES[sel] || EXAMPLES.general;
});

DOM.btnClear.addEventListener('click', () => {
    DOM.cfgInput.value = '';
    DOM.pipelineResults.classList.add('hidden');
    DOM.btnExportReport.style.display = 'none';
});

// Export Report
DOM.btnExportReport.addEventListener('click', () => {
    if (!pipelineStates || pipelineStates.length === 0) return;
    
    let html = `
    <div style="font-family: 'Outfit', Helvetica, sans-serif; color: #000; background: #fff; width: 800px; padding: 20px;">
        <h1 style="text-align:center; color:#111; border-bottom:2px solid #333; padding-bottom:10px; margin-bottom: 20px;">CFG Simplification Comprehensive Document</h1>`;
    
    const stageNames = [
        "Stage 0: Original Input Grammar",
        "Stage 1: Useless Symbols (Initial Sweep)",
        "Stage 2: Null Productions Removal",
        "Stage 3: Unit Productions Removal",
        "Stage 4: Final Cleanup Sweep"
    ];

    pipelineStates.forEach((state, i) => {
        let pageBreak = i > 0 && i < 4 ? 'page-break-after: always;' : '';
        html += `<div style="${pageBreak} margin-bottom: 30px;">`;
        html += `<h2 style="color:#2b6cb0; border-bottom:1px solid #ccc; padding-bottom:5px;">${stageNames[i]}</h2>`;

        // Render detailed transformations
        if (state.logs && state.logs.length > 0) {
            html += `<h3 style="color:#333; font-size:16px; margin-bottom:10px;">Rule Tracking & Justifications</h3>`;
            html += `<div style="font-size:12px; font-family:'Fira Code', monospace; line-height:1.6; margin-bottom:15px;">`;
            state.logs.forEach(log => {
                if (log.type === "phase1" || log.type === "phase2" || log.type === "production_generation" || log.type === "unit_replacement") {
                    html += `<div style="margin-bottom:10px; border-left:3px solid #cbd5e1; padding-left:10px;">`;
                    html += `<strong style="color:#0f172a; font-family:'Outfit', Helvetica, sans-serif; font-size: 14px;">${log.title}</strong><br>`;
                    
                    if (log.type === "phase1" || log.type === "phase2") {
                        if (log.removed_rules && log.removed_rules.length > 0) {
                            log.removed_rules.forEach(rr => {
                                html += `<span style="color:#b91c1c;">[-] Removed: ${rr.original_rule}</span> <em style="color:#64748b;">(${rr.reason})</em><br>`;
                            });
                        } else {
                            html += `<span style="color:#4b5563;">No rules removed in this specific sweep.</span><br>`;
                        }
                    } else if (log.type === "production_generation" && log.rule_transformations) {
                        log.rule_transformations.forEach(rt => {
                            html += `<div style="margin-top:5px; padding:5px; background:#f8fafc; border:1px solid #e2e8f0;">`;
                            html += `Context Rule: <strong>${rt.original_rule}</strong><br>`;
                            rt.generated_rules.forEach(gr => {
                            let isKept = gr.type === 'original';
                            let symbol = isKept ? '[=]' : '[+]';
                            let color = isKept ? '#475569' : '#15803d';
                            html += `<span style="color:${color}; margin-left:15px;">↳ ${symbol} ${isKept ? 'Kept' : 'Generated'}: ${gr.rule}</span> <em style="color:#64748b;">(${gr.reason})</em><br>`;
                            });
                            html += `</div>`;
                        });
                    } else if (log.type === "unit_replacement" && log.rule_transformations) {
                        log.rule_transformations.forEach(rt => {
                            html += `<div style="margin-top:5px; padding:5px; background:#f8fafc; border:1px solid #e2e8f0;">`;
                            html += `Variable target: <strong>${rt.non_terminal}</strong><br>`;
                            rt.removed_units.forEach(ru => html += `<span style="color:#b91c1c; margin-left:15px;">↳ [-] Removed unit: ${ru}</span><br>`);
                            rt.added_productions.forEach(ap => html += `<span style="color:#15803d; margin-left:15px;">↳ [+] Generated: ${ap.rule}</span> <em style="color:#64748b;">(via ${ap.derived_from})</em><br>`);
                            html += `</div>`;
                        });
                    }
                    html += `</div>`;
                }
            });
            html += `</div>`;
        }
        
        // Render Resuling Grammar
        html += `<div style="background:#f4f4f5; padding:15px; border-radius:5px; margin-bottom:15px; border:1px solid #e4e4e7;">`;
        html += `<h3 style="margin-top:0; color:#111; font-size:16px;">Resulting Grammar (G${i})</h3>`;
        html += `<pre style="font-family:'Fira Code', monospace; margin:0; font-size:14px; color:#111; line-height:1.5;">`;
        let ruleCount = 0;
        for (let k in state.grammar) {
            let rhs = state.grammar[k].map(x => x === '' ? 'ε' : x).join(' | ');
            if (rhs) {
                html += `<strong>${k}</strong> → ${rhs}\n`;
                ruleCount++;
            }
        }
        if (ruleCount === 0) html += `<span style="color:#ef4444;">Language is empty (No rules left)</span>`;
        html += `</pre></div>`;
        
        html += `</div>`;
    });

    html += `</div>`;

    const dsName = "CFG_Comprehensive_Report.pdf";
    
    const styles = `
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700&family=Fira+Code&display=swap');
            body { font-family: 'Outfit', Helvetica, sans-serif; color: #000; background: #fff; padding: 40px; }
            h1, h2, h3 { color: #111; margin-top: 25px; border-bottom: 2px solid #eee; padding-bottom: 8px; }
            h2 { color: #2b6cb0; }
            pre, code { font-family: 'Fira Code', 'Courier New', monospace; font-size: 13px; background: #f8fafc; padding: 15px; border: 1px solid #e2e8f0; border-radius: 5px; white-space: pre-wrap; display: block; }
            .token-removed { color: #b91c1c; text-decoration: line-through; }
            .token-added { color: #15803d; font-weight: bold; }
            div { margin-bottom: 15px; }
            @media print {
                .page-break { page-break-after: always; }
                body { padding: 0; }
            }
        </style>
    `;

    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
        alert("Pop-up blocked! Please allow pop-ups to download the report.");
        return;
    }
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>CFG Simplification Report</title>
            ${styles}
        </head>
        <body>
            ${html}
            <script>
                window.onload = function() {
                    window.print();
                    // window.close(); // Optional: close window after printing
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
});

// Dynamic Rule Builder
DOM.btnAddRule.addEventListener('click', () => {
    const lhs = DOM.builderLhs.value.trim().toUpperCase();
    const rhs = DOM.builderRhs.value.trim();
    if (!lhs || !rhs) {
        alert("Please provide both LHS and RHS");
        return;
    }
    const newRule = lhs + " -> " + rhs + "\n";
    const textarea = DOM.cfgInput;
    if (textarea.value && !textarea.value.endsWith('\n')) {
        textarea.value += '\n';
    }
    textarea.value += newRule;
    DOM.builderLhs.value = '';
    DOM.builderRhs.value = '';
    DOM.builderLhs.focus();
});

// Playback Handlers
let dynamicNetworkInstance = null;
let dynamicVisNodes = null;
let dynamicVisEdges = null;

function updateMorphingGraph(beforeGrammar, afterGrammar, forceReload = false) {
    if (!window.vis) return;
    
    // For a forced reload, we'll clear everything and recreate the network instance
    if (forceReload) {
        if (dynamicNetworkInstance) {
            dynamicNetworkInstance.destroy();
            dynamicNetworkInstance = null;
        }
        if (dynamicVisNodes) {
            dynamicVisNodes.clear();
            dynamicVisEdges.clear();
        }
    }

    if (!dynamicVisNodes) {
        dynamicVisNodes = new vis.DataSet();
        dynamicVisEdges = new vis.DataSet();
    }
    
    function getDep(grammar) {
        let nodes = new Set();
        let edges = new Set();
        let isTerm = new Set();
        for (let lhs in grammar) {
            nodes.add(lhs);
            for (let rhs of grammar[lhs]) {
                if (rhs === '') { nodes.add('?'); isTerm.add('?'); edges.add(`${lhs}->?`); continue; }
                for (let i=0; i<rhs.length; i++) {
                    let char = rhs[i];
                    if (char !== ' ' && char !== '|') {
                        nodes.add(char); edges.add(`${lhs}->${char}`);
                        if (!(char >= 'A' && char <= 'Z')) isTerm.add(char);
                    }
                }
            }
        }
        return { nodes, edges, isTerm };
    }
    
    const bDep = getDep(beforeGrammar);
    const aDep = getDep(afterGrammar);
    
    let allNodes = new Set([...bDep.nodes, ...aDep.nodes]);
    let allEdges = new Set([...bDep.edges, ...aDep.edges]);
    
    let newNodes = [];
    allNodes.forEach(n => {
        const isTerminal = bDep.isTerm.has(n) || aDep.isTerm.has(n);
        let nodeStatus = 'kept';
        if (!bDep.nodes.has(n)) nodeStatus = 'added';
        if (!aDep.nodes.has(n)) nodeStatus = 'removed';
        
        let color = isTerminal ? '#2d3748' : '#4a5568';
        if (n === 'S') color = '#2b6cb0'; 
        let border = '#111'; let dashes = false;
        
        if (nodeStatus === 'added') { color = 'rgba(16, 185, 129, 0.4)'; border = '#10b981'; }
        if (nodeStatus === 'removed') { color = 'rgba(239, 68, 68, 0.4)'; border = '#ef4444'; dashes = true; }
        
        newNodes.push({ 
            id: n, label: n, color: { background: color, border: border }, 
            font: { color: 'white', face: 'Fira Code' }, 
            shape: isTerminal ? 'box' : 'circle', shapeProperties: { borderDashes: dashes },
            borderWidth: nodeStatus !== 'kept' ? 2 : 1, margin: 10
        });
    });
    
    let newEdges = [];
    allEdges.forEach(e => {
        let [from, to] = e.split('->');
        let edgeStatus = 'kept';
        if (!bDep.edges.has(e)) edgeStatus = 'added';
        if (!aDep.edges.has(e)) edgeStatus = 'removed';
        
        let color = '#555'; let dashes = false; let width = 1;
        if (edgeStatus === 'added') { color = '#10b981'; width = 2.5; }
        if (edgeStatus === 'removed') { color = '#ef4444'; dashes = true; width = 2.5; }
        
        newEdges.push({ id: e, from, to, arrows: 'to', color: { color }, dashes, width });
    });

    let currentNodes = dynamicVisNodes.getIds();
    let nodesToRemove = currentNodes.filter(id => !allNodes.has(id));
    if (nodesToRemove.length > 0) dynamicVisNodes.remove(nodesToRemove);
    
    let currentEdges = dynamicVisEdges.getIds();
    let edgesToRemove = currentEdges.filter(id => !allEdges.has(id));
    if (edgesToRemove.length > 0) dynamicVisEdges.remove(edgesToRemove);

    dynamicVisNodes.update(newNodes);
    dynamicVisEdges.update(newEdges);
    
    if (!dynamicNetworkInstance) {
        DOM.dynamicNetwork.innerHTML = '';
        const options = {
            interaction: { zoomView: false, dragView: false, dragNodes: true },
            physics: { 
                enabled: true,
                barnesHut: { 
                    gravitationalConstant: -3000, 
                    centralGravity: 0.4, 
                    springLength: 90, 
                    springConstant: 0.15, 
                    damping: 0.25 
                },
                stabilization: { iterations: 150 }
            },
            layout: { randomSeed: 5 }
        };
        dynamicNetworkInstance = new vis.Network(DOM.dynamicNetwork, {nodes: dynamicVisNodes, edges: dynamicVisEdges}, options);
        networkInstances['dynamic-network'] = dynamicNetworkInstance;
    }
}

// Centeralized Reset Graph Handler
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-reset-graph')) {
        const networkId = e.target.getAttribute('data-network');
        
        if (networkId === 'dynamic-network') {
            // Re-render the dynamic network at current stage
            const stage = currentPlaybackStage;
            const before = stage === 0 ? pipelineStates[0].grammar : pipelineStates[stage - 1].grammar;
            const after = pipelineStates[stage].grammar;
            updateMorphingGraph(before, after, true);
        } else {
            // Re-render static diff graphs for Stage 1-4
            const stageMap = {
                'u1-network': [0, 1],
                'null-network': [1, 2],
                'unit-network': [2, 3],
                'u2-network': [3, 4]
            };
            const indices = stageMap[networkId];
            if (indices && pipelineStates.length > 0) {
                const container = document.getElementById(networkId);
                renderGrammarDiffGraph(pipelineStates[indices[0]].grammar, pipelineStates[indices[1]].grammar, container);
            }
        }
    }
});

function updateDynamicPlayback() {
    DOM.graphStageLabel.innerText = STAGE_LABELS[currentPlaybackStage];
    DOM.btnPrevGraph.disabled = currentPlaybackStage === 0;
    DOM.btnNextGraph.disabled = currentPlaybackStage === 4;
    
    if (currentPlaybackStage === 0) {
        updateMorphingGraph(pipelineStates[0].grammar, pipelineStates[0].grammar);
    } else {
        updateMorphingGraph(pipelineStates[currentPlaybackStage - 1].grammar, pipelineStates[currentPlaybackStage].grammar);
    }
}

DOM.btnPrevGraph.addEventListener('click', () => {
    if (currentPlaybackStage > 0) {
        currentPlaybackStage--;
        updateDynamicPlayback();
    }
});
DOM.btnNextGraph.addEventListener('click', () => {
    if (currentPlaybackStage < 4) {
        currentPlaybackStage++;
        updateDynamicPlayback();
    }
});
