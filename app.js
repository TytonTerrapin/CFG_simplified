import { remove_null_productions, remove_unit_productions, remove_useless_symbols, _calculate_metrics } from './logic.js';

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
    
    // Stage-specific containers
    stages: [
        {
            panel: document.getElementById('step-1'),
            logs: document.getElementById('u1-logs'),
            before: document.getElementById('u1-before'),
            after: document.getElementById('u1-after'),
            network: document.getElementById('u1-network'),
            stats: 'u1-stats',
            sets: 'u1-sets'
        },
        {
            panel: document.getElementById('step-2'),
            logs: document.getElementById('null-logs'),
            before: document.getElementById('null-before'),
            after: document.getElementById('null-after'),
            network: document.getElementById('null-network'),
            stats: 'null-stats',
            sets: 'null-sets'
        },
        {
            panel: document.getElementById('step-3'),
            logs: document.getElementById('unit-logs'),
            before: document.getElementById('unit-before'),
            after: document.getElementById('unit-after'),
            network: document.getElementById('unit-network'),
            stats: 'unit-stats',
            sets: 'unit-sets'
        },
        {
            panel: document.getElementById('step-4'),
            logs: document.getElementById('u2-logs'),
            before: document.getElementById('u2-before'),
            after: document.getElementById('u2-after'),
            network: document.getElementById('u2-network'),
            stats: 'u2-stats',
            sets: 'u2-sets'
        }
    ],

    finalOrig: document.getElementById('final-original'),
    finalSimp: document.getElementById('final-simplified'),
    
    // Dynamic Replay
    btnPrevGraph: document.getElementById('btn-prev-graph'),
    btnNextGraph: document.getElementById('btn-next-graph'),
    graphStageLabel: document.getElementById('graph-stage-label'),
    dynamicNetwork: document.getElementById('dynamic-network'),
    
    // Navigator & Progress
    navigator: document.getElementById('stage-navigator'),
    navItems: document.querySelectorAll('.nav-item'),
    progressBar: document.getElementById('scroll-progress'),
    
    btnExportReport: document.getElementById('btn-export-report'),
};

const STAGE_LABELS = [
    "Original Grammar",
    "Stage 1: Useless Symbols",
    "Stage 2: Null Productions",
    "Stage 3: Unit Productions",
    "Stage 4: Final Cleanup"
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
        const rhsRaw = rhsRawToken.split('|').map(s => s.trim());
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
    return logs.map(log => {
        let details = '';
        if (log.type === "nullable_detection") {
            details = `<div class="rule-list"><div class="rule-item">Nullable: { ${log.nullable_symbols.join(', ')} }</div></div>`;
        } else if (log.type === "production_generation") {
            details = `<div class="rule-list">` + log.rule_transformations.map(rt => {
                let html = `<div class="rule-item"><strong>Rule: ${rt.original_rule}</strong></div>`;
                rt.generated_rules.forEach(gr => {
                    html += `<div class="rule-item ${gr.type === 'original' ? 'kept' : 'addition'}" style="margin-left: 15px;">
                        <span>${gr.type === 'original' ? 'Kept' : 'Generated'}: ${gr.rule}</span>
                    </div>`;
                });
                return html;
            }).join('') + `</div>`;
        } else if (log.type === "unit_replacement") {
            details = `<div class="rule-list">` + log.rule_transformations.map(rt => {
                let s = "";
                rt.removed_units.forEach(ru => s += `<div class="rule-item removal">Removed unit pair: ${ru}</div>`);
                rt.added_productions.forEach(ap => s += `<div class="rule-item addition">Generated: ${ap.rule}</div>`);
                return s;
            }).join('') + `</div>`;
        } else if (log.type === "phase1" || log.type === "phase2") {
            details = `<div class="rule-list">`;
            if (log.removed_symbols?.length > 0) details += `<div class="rule-item removal">Removed Symbols: { ${log.removed_symbols.join(', ')} }</div>`;
            log.removed_rules?.forEach(rr => details += `<div class="rule-item removal">Removed Rule: ${rr.original_rule}</div>`);
            details += `</div>`;
        }
        return `<div class="log-entry"><h4>${log.title}</h4><p>${log.description}</p>${details}</div>`;
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
    if (stageIdx === 1 || stageIdx === 4) {
        html += `<div class="set-line"><span class="set-label">Generating G:</span> { ${sets.generating?.join(', ') || 'Ø'} }</div>`;
        html += `<div class="set-line"><span class="set-label">Reachable R:</span> { ${sets.reachable?.join(', ') || 'Ø'} }</div>`;
    } else if (stageIdx === 2) {
        html += `<div class="set-line"><span class="set-label">Nullable N:</span> { ${sets.nullable?.join(', ') || 'Ø'} }</div>`;
    } else if (stageIdx === 3) {
        html += `<div class="set-line"><span class="set-label">Derivation Closures:</span></div>`;
        for (let k in sets.closures) html += `<div class="set-line" style="margin-left:15px; font-size: 0.9rem;">D(${k}) = { ${sets.closures[k].join(', ')} }</div>`;
    }
    container.innerHTML = html;
}

// --- Graphs ---

function renderGrammarDiffGraph(beforeGrammar, afterGrammar, container) {
    if (!window.vis || !container) return;
    container.innerHTML = '';
    const getDep = (grammar) => {
        let nodes = new Set(), edges = new Set(), isTerm = new Set();
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
    };
    const bD = getDep(beforeGrammar), aD = getDep(afterGrammar);
    const visNodes = new vis.DataSet(), visEdges = new vis.DataSet();
    const allNodes = new Set([...bD.nodes, ...aD.nodes]);
    allNodes.forEach(n => {
        let status = !bD.nodes.has(n) ? 'added' : (!aD.nodes.has(n) ? 'removed' : 'kept');
        let color = '#4a5568', border = '#111', dashes = false;
        if (status === 'added') { color = 'rgba(16, 185, 129, 0.4)'; border = '#10b981'; }
        if (status === 'removed') { color = 'rgba(239, 68, 68, 0.4)'; border = '#ef4444'; dashes = true; }
        if (n === 'S') color = '#2b6cb0';
        visNodes.add({ id: n, label: n, color: { background: color, border: border }, shape: (bD.isTerm.has(n) || aD.isTerm.has(n)) ? 'box' : 'circle', shapeProperties: { borderDashes: dashes }, font: { color: 'white' } });
    });
    new Set([...bD.edges, ...aD.edges]).forEach(e => {
        let [from, to] = e.split('->'), status = !bD.edges.has(e) ? 'added' : (!aD.edges.has(e) ? 'removed' : 'kept');
        let color = status === 'added' ? '#10b981' : (status === 'removed' ? '#ef4444' : '#555');
        visEdges.add({ from, to, arrows: 'to', color: { color }, dashes: status === 'removed', width: status === 'kept' ? 1 : 2.5 });
    });
    networkInstances[container.id] = new vis.Network(container, {nodes: visNodes, edges: visEdges}, { physics: { stabilization: true }, interaction: { zoomView: false } });
}

// --- Pipeline Control ---

function runFullPipeline() {
    const initG = parseGrammar(DOM.cfgInput.value);
    const s0 = { stageName: "Original", grammar: initG, metrics: _calculate_metrics(initG) };
    const s1 = remove_useless_symbols(deepCopy(initG), "Initial Useless Sweep");
    const s2 = remove_null_productions(deepCopy(s1.grammar));
    const s3 = remove_unit_productions(deepCopy(s2.grammar));
    const s4 = remove_useless_symbols(deepCopy(s3.grammar), "Final Cleanup Sweep");
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
        const stage = pipelineHistory[i], prev = pipelineHistory[i-1], dm = DOM.stages[i-1];
        dm.logs.innerHTML = buildHtmlLogs(stage.step_logs || stage.logs);
        dm.before.innerHTML = renderGrammarDiff(prev.grammar, stage.grammar, 'before');
        dm.after.innerHTML = renderGrammarDiff(prev.grammar, stage.grammar, 'after');
        renderStats(prev.metrics, stage.metrics, dm.stats);
        renderSets(stage.stage_sets || stage.sets, i, dm.sets);
    }
    DOM.finalOrig.innerHTML = renderGrammarStandardFormat(pipelineHistory[0].grammar);
    DOM.finalSimp.innerHTML = renderGrammarStandardFormat(pipelineHistory[4].grammar);
    renderStats(pipelineHistory[0].metrics, pipelineHistory[4].metrics, 'final-stats');

    setTimeout(() => {
        for (let i = 1; i <= 4; i++) renderGrammarDiffGraph(pipelineHistory[i-1].grammar, pipelineHistory[i].grammar, DOM.stages[i-1].network);
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
            entry.target.classList.add('revealed');
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
DOM.btnLoadExample.addEventListener('click', () => { DOM.cfgInput.value = EXAMPLES[DOM.exampleSelect.value] || EXAMPLES.general; });
DOM.btnClear.addEventListener('click', () => { DOM.cfgInput.value = ''; DOM.pipelineResults.classList.add('hidden'); DOM.navigator.classList.remove('visible'); });

DOM.btnAddRule.addEventListener('click', () => {
    const lhs = DOM.builderLhs.value.trim().toUpperCase(), rhs = DOM.builderRhs.value.trim();
    if (!lhs || !rhs) return;
    DOM.cfgInput.value += (DOM.cfgInput.value && !DOM.cfgInput.value.endsWith('\n') ? '\n' : '') + `${lhs} -> ${rhs}\n`;
    DOM.builderLhs.value = ''; DOM.builderRhs.value = ''; DOM.builderLhs.focus();
});

// Playback
let dynamicNetwork = null;
function updateDynamicPlayback() {
    if (!pipelineHistory.length) return;
    const cur = pipelineHistory[currentPlaybackStage], prev = currentPlaybackStage === 0 ? cur : pipelineHistory[currentPlaybackStage-1];
    DOM.graphStageLabel.innerText = STAGE_LABELS[currentPlaybackStage];
    renderGrammarDiffGraph(prev.grammar, cur.grammar, DOM.dynamicNetwork);
    DOM.btnPrevGraph.disabled = currentPlaybackStage === 0;
    DOM.btnNextGraph.disabled = currentPlaybackStage === STAGE_LABELS.length - 1;
}

DOM.btnPrevGraph.addEventListener('click', () => { if (currentPlaybackStage > 0) { currentPlaybackStage--; updateDynamicPlayback(); } });
DOM.btnNextGraph.addEventListener('click', () => { if (currentPlaybackStage < STAGE_LABELS.length - 1) { currentPlaybackStage++; updateDynamicPlayback(); } });

// --- PDF Generation Overhaul ---

async function generateProjectPDF() {
    if (!pipelineHistory || pipelineHistory.length === 0) {
        alert("Please run the simplification first.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const primaryColor = [16, 185, 129];
    const textColor = [20, 20, 20];
    const secondaryTextColor = [100, 100, 100];
    
    let currentY = 20;
    const margin = 20;
    const pageHeight = 297;

    // Helper: Ensure Space
    const ensureSpace = (h) => {
        if (currentY + h > pageHeight - 20) {
            doc.addPage();
            currentY = 20;
            return true;
        }
        return false;
    };

    // Helper: Add Section Header
    const addSectionHeader = (text) => {
        ensureSpace(15);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(...primaryColor);
        doc.text(text, margin, currentY);
        doc.setDrawColor(...primaryColor);
        doc.setLineWidth(0.3);
        doc.line(margin, currentY + 1.5, 190, currentY + 1.5);
        currentY += 10;
    };

    // --- Page 1: Title & Overview ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(...textColor);
    doc.text("CFG Simplification Report", margin, currentY + 15);
    currentY += 25;
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...secondaryTextColor);
    doc.text(`Execution Date: ${new Date().toLocaleString()}`, margin, currentY);
    currentY += 12;

    addSectionHeader("Initial Grammar State");
    
    const initMetrics = pipelineHistory[0].metrics;
    doc.autoTable({
        startY: currentY,
        head: [['Metric', 'Symbol Count']],
        body: [
            ['Productions', initMetrics.productions],
            ['Variables', initMetrics.variables],
            ['Terminals', initMetrics.terminals]
        ],
        theme: 'striped',
        headStyles: { fillColor: primaryColor, textColor: [255, 255, 255] },
        styles: { fontSize: 10, cellPadding: 2 },
        margin: { left: margin, right: margin }
    });
    currentY = doc.lastAutoTable.finalY + 10;

    ensureSpace(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...textColor);
    doc.text("Input Grammar Rules:", margin, currentY);
    currentY += 6;
    
    const sourceGrammarLines = [];
    for (let k in pipelineHistory[0].grammar) {
        sourceGrammarLines.push(`${k} -> ${pipelineHistory[0].grammar[k].map(x => x || 'ε').join(' | ')}`);
    }

    doc.setFont("courier", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(sourceGrammarLines, margin + 5, currentY);
    currentY += (sourceGrammarLines.length * 5) + 10;

    // --- Stages 1-4 Analysis ---
    for (let i = 1; i <= 4; i++) {
        const stage = pipelineHistory[i];
        
        addSectionHeader(STAGE_LABELS[i]);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(...secondaryTextColor);
        
        const descriptions = [
            "",
            "Phase 1 & 2: Eliminating non-productive symbols and those unreachable from 'S'.",
            "Handling nullable symbols (X ->* ε) by creating non-null production variants.",
            "Eliminating unit transitions (A -> B) via derivation closure substitution.",
            "Final Sweep: Pruning any byproduct symbols that became redundant."
        ];
        
        const splitDesc = doc.splitTextToSize(descriptions[i], 170);
        doc.text(splitDesc, margin, currentY);
        currentY += (splitDesc.length * 5) + 5;

        // Transformation Table Log
        const logData = [];
        const logs = stage.step_logs || stage.logs || [];
        logs.forEach(log => {
            if (log.removed_symbols?.length > 0) logData.push(['Pruning', `Removed symbols: { ${log.removed_symbols.join(', ')} }`]);
            if (log.removed_rules?.length > 0) log.removed_rules.forEach(r => logData.push(['Pruning', r.original_rule.replace('→', '->')]));
            if (log.rule_transformations) {
                log.rule_transformations.forEach(rt => {
                    const origClean = rt.original_rule ? rt.original_rule.replace('→', '->') : '';
                    if (rt.generated_rules) {
                        rt.generated_rules.filter(g => g.type === 'generated').forEach(g => logData.push(['Generation', `From ${origClean} produced ${g.rule.replace('→', '->')}`]));
                    }
                    if (rt.added_productions) {
                        rt.added_productions.forEach(ap => logData.push(['Generation', `New rule: ${ap.rule.replace('→', '->')}`]));
                    }
                });
            }
        });

        if (logData.length > 0) {
            doc.autoTable({
                startY: currentY,
                head: [['Action', 'Transformation Detail']],
                body: logData,
                theme: 'grid',
                headStyles: { fillColor: [248, 248, 248], textColor: [40, 40, 40], fontStyle: 'bold' },
                styles: { fontSize: 8, cellPadding: 2 },
                margin: { left: margin, right: margin }
            });
            currentY = doc.lastAutoTable.finalY + 8;
        }

        // Graph Inclusion (Canvas Capture)
        const networkId = DOM.stages[i - 1].network.id;
        const stageNetwork = networkInstances[networkId];
        if (stageNetwork) {
            try {
                const canvas = DOM.stages[i - 1].network.querySelector('canvas');
                if (canvas) {
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = canvas.width; tempCanvas.height = canvas.height;
                    const tCtx = tempCanvas.getContext('2d');
                    tCtx.fillStyle = '#FFFFFF';
                    tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                    tCtx.drawImage(canvas, 0, 0);
                    
                    const imgData = tempCanvas.toDataURL('image/png', 0.8);
                    const imgH = 50; // Optimized height
                    ensureSpace(imgH + 10);
                    
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(10);
                    doc.setTextColor(...textColor);
                    doc.text("State Visualization:", margin, currentY);
                    doc.addImage(imgData, 'PNG', margin, currentY + 2, 170, imgH, undefined, 'FAST');
                    currentY += imgH + 15;
                }
            } catch (e) { console.warn("Graph capture skipped", e); }
        }
    }

    // --- Final Result Analysis ---
    addSectionHeader("Final Simplified Result");

    const finalSimpLines = [];
    for (let k in pipelineHistory[4].grammar) {
        finalSimpLines.push(`${k} -> ${pipelineHistory[4].grammar[k].map(x => x || 'ε').join(' | ')}`);
    }
    
    ensureSpace((finalSimpLines.length * 5) + 30);
    doc.setFont("courier", "normal");
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.text(finalSimpLines, margin + 5, currentY + 5);
    currentY += (finalSimpLines.length * 5) + 15;

    const finalMetrics = pipelineHistory[4].metrics;
    const startMetrics = pipelineHistory[0].metrics;
    const calcRed = (s, f) => s === 0 ? '0%' : `${Math.round((1 - f/s)*100)}%`;
    
    doc.autoTable({
        startY: currentY,
        head: [['Metric', 'Initial', 'Final', 'Reduction']],
        body: [
            ['Productions', startMetrics.productions, finalMetrics.productions, calcRed(startMetrics.productions, finalMetrics.productions)],
            ['Variables', startMetrics.variables, finalMetrics.variables, calcRed(startMetrics.variables, finalMetrics.variables)],
            ['Terminals', startMetrics.terminals, finalMetrics.terminals, '0%']
        ],
        theme: 'striped',
        headStyles: { fillColor: primaryColor },
        styles: { cellPadding: 2, fontSize: 9 },
        margin: { left: margin, right: margin }
    });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...secondaryTextColor);
    doc.text(`CFG Simplifier v2.0 - Final report generated at ${new Date().toLocaleTimeString()}`, 105, 285, { align: 'center' });

    doc.save(`CFG_Report_${Date.now()}.pdf`);
}

DOM.btnExportReport.addEventListener('click', generateProjectPDF);

window.populateExample = (type) => { if (EXAMPLES[type]) { DOM.cfgInput.value = EXAMPLES[type]; document.getElementById('step-0').scrollIntoView({ behavior: 'smooth' }); } };

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-reset-graph')) {
        const nid = e.target.getAttribute('data-network');
        if (networkInstances[nid]) networkInstances[nid].fit({ animation: true });
    }
});
