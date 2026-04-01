function _calculate_metrics(grammar) {
    let productions = 0;
    const variables = new Set(Object.keys(grammar));
    const terminals = new Set();
    
    for (const lhs in grammar) {
        for (const rhs of grammar[lhs]) {
            productions++;
            if (rhs === '') continue;
            for (let i = 0; i < rhs.length; i++) {
                const char = rhs[i];
                if (!isUpper(char) && char !== ' ' && char !== '|') {
                    terminals.add(char);
                } else if (isUpper(char)) {
                    variables.add(char);
                }
            }
        }
    }
    return {
        productions,
        variables: variables.size,
        terminals: terminals.size
    };
}

// -----------------------------------------
// 1. Remove Null Productions
// -----------------------------------------
function remove_null_productions(grammar) {
    const step_logs = [];
    const workingGrammar = JSON.parse(JSON.stringify(grammar));
    const nullable = _find_nullable(workingGrammar);
    
    step_logs.push({
        title: "Find Nullable Non-Terminals",
        description: "A non-terminal is nullable if it can derive ε (empty string). We iteratively find all nullable symbols.",
        nullable_symbols: Array.from(nullable),
        type: "nullable_detection"
    });

    if (nullable.size === 0) {
        return { 
            stageName: "Null Productions Removal",
            grammar: workingGrammar, 
            step_logs, 
            stage_sets: { nullable: [] },
            metrics: _calculate_metrics(workingGrammar)
        };
    }

    const updatedGrammar = {};
    const rule_transformations = [];

    // Initialize updatedGrammar with keys from workingGrammar
    for (const nt in workingGrammar) updatedGrammar[nt] = new Set();

    for (const [non_terminal, productions] of Object.entries(workingGrammar)) {
        for (const production of productions) {
            if (production === '') continue; // Skip epsilon
            
            const original_rule = `${non_terminal} → ${production}`;
            const generated_rules = [];
            
            // Keep original
            updatedGrammar[non_terminal].add(production);
            generated_rules.push({ rule: original_rule, reason: "Original rule (kept)", type: "original" });
            
            const nullable_positions = [];
            for (let i = 0; i < production.length; i++) {
                if (nullable.has(production[i])) nullable_positions.push(i);
            }
            
            if (nullable_positions.length > 0) {
                for (let r = 1; r <= nullable_positions.length; r++) {
                    const combos = getCombinations(nullable_positions, r);
                    for (const combo of combos) {
                        let new_prod = '';
                        for (let i = 0; i < production.length; i++) {
                            if (!combo.includes(i)) new_prod += production[i];
                        }
                        updatedGrammar[non_terminal].add(new_prod);
                        const removed_symbols = combo.map(i => production[i]);
                        generated_rules.push({
                            rule: `${non_terminal} → ${new_prod || 'ε'}`,
                            reason: `Removed nullable symbol(s): ${removed_symbols.join(', ')}`,
                            type: "generated"
                        });
                    }
                }
            }
            
            rule_transformations.push({ original_rule: original_rule, generated_rules: generated_rules });
        }
    }

    const finalGrammar = {};
    for (const nt in updatedGrammar) {
        finalGrammar[nt] = Array.from(updatedGrammar[nt]).filter(p => p !== '');
    }

    step_logs.push({
        title: "Generate Alternative Productions",
        description: "For each production containing nullable symbols, we generate alternatives by removing nullable occurrences.",
        rule_transformations: rule_transformations,
        type: "production_generation"
    });

    step_logs.push({
        title: "Remove Null Productions",
        description: "All ε productions are completely removed from the grammar.",
        type: "null_removal"
    });

    return { 
        stageName: "Null Productions Removal",
        grammar: finalGrammar, 
        step_logs, 
        stage_sets: { nullable: Array.from(nullable) },
        metrics: _calculate_metrics(finalGrammar)
    };
}

function _find_nullable(grammar) {
    const nullable = new Set();
    let changed = true;
    
    while (changed) {
        changed = false;
        for (const [non_terminal, productions] of Object.entries(grammar)) {
            if (nullable.has(non_terminal)) continue;
            
            for (const production of productions) {
                if (production === '') {
                    nullable.add(non_terminal);
                    changed = true;
                    break;
                }
                
                let has_terminal = false;
                for (let i = 0; i < production.length; i++) {
                    if (!isUpper(production[i])) {
                        has_terminal = true;
                        break;
                    }
                }
                
                if (has_terminal) continue;
                
                let all_nullable = true;
                for (let i = 0; i < production.length; i++) {
                    if (!nullable.has(production[i])) {
                        all_nullable = false;
                        break;
                    }
                }
                
                if (all_nullable) {
                    nullable.add(non_terminal);
                    changed = true;
                    break;
                }
            }
        }
    }
    return nullable;
}

// -----------------------------------------
// 2. Remove Unit Productions
// -----------------------------------------
function remove_unit_productions(grammar) {
    const step_logs = [];
    const workingGrammar = JSON.parse(JSON.stringify(grammar));
    const unit_prods = _find_unit_productions(workingGrammar);
    
    step_logs.push({
        title: "Identify Unit Productions",
        description: "A unit production is of the form A -> B where A and B are non-terminals.",
        unit_productions: unit_prods,
        type: "unit_identification"
    });

    if (Object.keys(unit_prods).length === 0) {
        return { 
            stageName: "Unit Productions Removal",
            grammar: workingGrammar, 
            step_logs, 
            stage_sets: { closures: {} },
            metrics: _calculate_metrics(workingGrammar)
        };
    }

    const graph = _build_unit_graph(workingGrammar, unit_prods);
    const closure = _find_closure(graph, workingGrammar);
    
    const closureArrayFormat = {};
    for (let k in closure) closureArrayFormat[k] = Array.from(closure[k]);

    step_logs.push({
        title: "Find Derivation Closure",
        description: "For each non-terminal, we find all non-terminals it can derive to through unit productions.",
        closure: closureArrayFormat,
        type: "closure_calculation"
    });

    const updatedGrammar = {};
    const rule_transformations = [];

    for (const non_terminal in workingGrammar) {
        const current_new_prods = new Set();
        const transformation = {
            non_terminal: non_terminal,
            removed_units: workingGrammar[non_terminal].filter(p => _is_unit_production(p)).map(p => `${non_terminal} → ${p}`),
            added_productions: []
        };
        
        // Fix: Use full closure directly as requested.
        // For each variable nt2 in closure[non_terminal], add nt2's non-unit productions to non_terminal.
        for (const nt2 of closure[non_terminal]) {
            if (workingGrammar[nt2]) {
                for (const prod of workingGrammar[nt2]) {
                    if (!_is_unit_production(prod)) {
                        if (!current_new_prods.has(prod)) {
                            current_new_prods.add(prod);
                            transformation.added_productions.push({
                                rule: `${non_terminal} → ${prod}`,
                                derived_from: `${nt2} → ${prod}`,
                                via_unit: `${non_terminal} → ... → ${nt2}`
                            });
                        }
                    }
                }
            }
        }
        
        updatedGrammar[non_terminal] = Array.from(current_new_prods);
        if (transformation.removed_units.length > 0) {
            rule_transformations.push(transformation);
        }
    }

    step_logs.push({
        title: "Replace Unit Productions",
        description: "Unit productions A -> B are replaced with all non-unit productions that B can derive to.",
        rule_transformations: rule_transformations,
        type: "unit_replacement"
    });

    return { 
        stageName: "Unit Productions Removal",
        grammar: updatedGrammar, 
        step_logs,
        stage_sets: { closures: closureArrayFormat },
        metrics: _calculate_metrics(updatedGrammar)
    };
}

function _find_unit_productions(grammar) {
    const unit_prods = {};
    for (const [non_terminal, productions] of Object.entries(grammar)) {
        const u = productions.filter(prod => _is_unit_production(prod));
        if (u.length > 0) unit_prods[non_terminal] = u;
    }
    return unit_prods;
}

function _is_unit_production(production) {
    return production.length === 1 && isUpper(production);
}

function _build_unit_graph(grammar, unit_prods) {
    const graph = {};
    for (const nt in grammar) graph[nt] = new Set();
    
    for (const [non_terminal, prods] of Object.entries(unit_prods)) {
        for (const prod of prods) {
            if (grammar[prod]) {
                graph[non_terminal].add(prod);
            }
        }
    }
    return graph;
}

function _find_closure(graph, grammar) {
    const all_nts = Object.keys(grammar);
    const closure = {};
    for (const nt of all_nts) closure[nt] = new Set([nt]);
    
    let changed = true;
    let iteration_count = 0;
    const max_iterations = all_nts.length + 1;
    
    while (changed && iteration_count < max_iterations) {
        changed = false;
        iteration_count++;
        
        for (const non_terminal of all_nts) {
            const new_reachable = new Set(closure[non_terminal]);
            for (const reachable_nt of Array.from(closure[non_terminal])) {
                if (graph[reachable_nt]) {
                    for (const next_nt of Array.from(graph[reachable_nt])) {
                        if (!new_reachable.has(next_nt)) {
                            new_reachable.add(next_nt);
                            changed = true;
                        }
                    }
                }
            }
            closure[non_terminal] = new_reachable;
        }
    }
    return closure;
}

// -----------------------------------------
// 3. Remove Useless Symbols
// -----------------------------------------
function remove_useless_symbols(grammar, stageTitle = "Useless Symbols Removal") {
    const step_logs = [];
    
    // Phase 1: Productive symbols
    const g1 = JSON.parse(JSON.stringify(grammar));
    const { log: log1, grammar: productiveGrammar } = _phase1_remove_nonproductive(g1);
    step_logs.push(log1);
    
    // Phase 2: Reachable symbols (operating on a clean clone of the productive grammar)
    const g2 = JSON.parse(JSON.stringify(productiveGrammar));
    const { log: log2, grammar: finalGrammar } = _phase2_remove_unreachable(g2);
    step_logs.push(log2);
    
    return { 
        stageName: stageTitle,
        grammar: finalGrammar, 
        step_logs,
        stage_sets: {
            generating: log1.productive_symbols,
            reachable: log2.reachable_symbols
        },
        metrics: _calculate_metrics(finalGrammar)
    };
}

function _phase1_remove_nonproductive(grammar) {
    const productive = new Set();
    let changed = true;
    const rule_removals = [];
    
    while (changed) {
        changed = false;
        const new_productive = new Set();
        
        for (const non_terminal in grammar) {
            if (productive.has(non_terminal)) continue;
            
            for (const production of grammar[non_terminal]) {
                if (_can_derive_terminals(production, productive)) {
                    new_productive.add(non_terminal);
                    changed = true;
                    break;
                }
            }
        }
        for (const nt of new_productive) productive.add(nt);
    }
    
    const all_nts = Object.keys(grammar);
    const non_productive = new Set(all_nts.filter(x => !productive.has(x)));
    
    const filteredGrammar = {};
    for (const non_terminal in grammar) {
        if (!productive.has(non_terminal)) {
            // Already added to removal logs below
            continue;
        }

        const remaining_prods = grammar[non_terminal].filter(prod => {
            for (const sym of prod) {
                if (isUpper(sym) && non_productive.has(sym)) return false;
            }
            return true;
        });

        const removed_prods = grammar[non_terminal].filter(prod => {
            for (const sym of prod) {
                if (isUpper(sym) && non_productive.has(sym)) return true;
            }
            return false;
        });
        
        for (const prod of removed_prods) {
            const bad_syms = [];
            for (const sym of prod) {
                if (isUpper(sym) && non_productive.has(sym)) bad_syms.push(sym);
            }
            rule_removals.push({
                original_rule: `${non_terminal} → ${prod}`,
                reason: `Contains non-productive symbol(s): ${bad_syms.join(', ')}`,
                removed_symbols: bad_syms,
                type: "non_productive"
            });
        }
        
        filteredGrammar[non_terminal] = remaining_prods;
    }

    // Explicitly document removed symbols that don't even have partially productive rules
    for (const sym of non_productive) {
        if (grammar[sym]) {
            for (const prod of grammar[sym]) {
                const alreadyLogged = rule_removals.some(r => r.original_rule === `${sym} → ${prod}`);
                if (!alreadyLogged) {
                    rule_removals.push({
                        original_rule: `${sym} → ${prod}`,
                        reason: `Symbol '${sym}' is not productive.`,
                        removed_symbols: [sym],
                        type: "non_productive"
                    });
                }
            }
        }
    }
    
    return {
        log: {
            title: "Phase 1: Remove Non-Productive Symbols",
            description: "A symbol is productive if it can derive a terminal string or ε. We iteratively find productive symbols and remove non-productive ones.",
            productive_symbols: Array.from(productive),
            removed_symbols: Array.from(non_productive),
            removed_rules: rule_removals,
            type: "phase1"
        },
        grammar: filteredGrammar
    };
}

function _phase2_remove_unreachable(grammar) {
    if (!grammar || !grammar['S']) {
        return {
            log: {
                title: "Phase 2: Remove Non-Reachable Symbols",
                description: "Start symbol 'S' not found. No symbols to check for reachability.",
                reachable_symbols: [],
                removed_symbols: [],
                removed_rules: [],
                type: "phase2"
            },
            grammar: {}
        };
    }
    
    const reachable = new Set(['S']);
    const queue = ['S'];
    const rule_removals = [];
    
    while (queue.length > 0) {
        const current = queue.shift();
        
        if (!grammar[current]) continue;
        
        for (const production of grammar[current]) {
            for (const symbol of production) {
                if (isUpper(symbol) && !reachable.has(symbol)) {
                    reachable.add(symbol);
                    queue.push(symbol);
                }
            }
        }
    }
    
    const non_reachable = new Set(Object.keys(grammar).filter(sym => !reachable.has(sym)));
    
    const filteredGrammar = {};
    for (const sym of reachable) {
        if (grammar[sym]) {
            filteredGrammar[sym] = grammar[sym];
        }
    }

    for (const sym of non_reachable) {
        if (grammar[sym]) {
            for (const prod of grammar[sym]) {
                rule_removals.push({
                    original_rule: `${sym} → ${prod}`,
                    reason: `Symbol '${sym}' is not reachable from start symbol S`,
                    unreachable_symbol: sym,
                    type: "non_reachable"
                });
            }
        }
    }
    
    return {
        log: {
            title: "Phase 2: Remove Non-Reachable Symbols",
            description: "Starting from S, we find all symbols reachable through derivations. Symbols not reachable from S are removed.",
            reachable_symbols: Array.from(reachable),
            removed_symbols: Array.from(non_reachable),
            removed_rules: rule_removals,
            type: "phase2"
        },
        grammar: filteredGrammar
    };
}

function _can_derive_terminals(production, productive) {
    if (production === '') return true;
    for (const symbol of production) {
        if (isUpper(symbol)) {
            if (!productive.has(symbol)) return false;
        }
    }
    return true;
}


function isUpper(char) {
    if (!char) return false;
    const c = char[0];
    return c >= 'A' && c <= 'Z';
}

function getCombinations(arr, k) {
    const results = [];
    function helper(start, combo) {
        if (combo.length === k) {
            results.push([...combo]);
            return;
        }
        for (let i = start; i < arr.length; i++) {
            combo.push(arr[i]);
            helper(i + 1, combo);
            combo.pop();
        }
    }
    helper(0, []);
    return results;
}

export { remove_null_productions, remove_unit_productions, remove_useless_symbols, _calculate_metrics, isUpper, getCombinations };
