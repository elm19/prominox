"""Dispatch strategies: who gets a free machine first when several units are waiting for it.

Every strategy turns (order, step, unit) into a priority number; lower is served first, ties go to whoever waited longest.
`optimized` searches for the priorities that make the run finish fastest. Finishing sooner with the same work also means
the machines are busy a larger share of the time, so one search improves both.
"""
import random
import time
from dataclasses import dataclass, field

from app.simulation import engine
from app.simulation.engine import OrderSpec, Priority, ProcessSpec, SimResult

LABELS = {
    "fifo": "First come, first served",
    "sequence": "One product after another",
    "proportional": "Evenly mixed",
    "spt": "Shortest operation first",
    "lpt": "Longest operation first",
    "remaining": "Most work remaining first",
    "optimized": "Optimized (searched)",
}
RULES = ["fifo", "sequence", "proportional", "spt", "lpt", "remaining"]
MAX_SEARCH_TASKS = 8000
SEARCH_SECONDS = 5.0
SEARCH_ITERATIONS = 400


def remaining_paths(orders: list[OrderSpec], transfer: float) -> list[list[float]]:
    out: list[list[float]] = []
    for order in orders:
        steps = engine.topo_order(order.steps)
        successors: dict[int, list[engine.StepSpec]] = {s.id: [] for s in steps}
        for s in steps:
            for d in s.deps:
                if d in successors:
                    successors[d].append(s)
        rem: dict[int, float] = {}
        for s in reversed(steps):
            tail = max((rem[n.id] + (transfer if n.process_id != s.process_id else 0.0) for n in successors[s.id]), default=0.0)
            rem[s.id] = s.minutes + tail
        out.append([rem[s.id] for s in steps])
    return out


def rule_priority(name: str, orders: list[OrderSpec], transfer: float) -> Priority | None:
    if name == "fifo":
        return None
    ordered = [engine.topo_order(o.steps) for o in orders]
    minutes = [[s.minutes for s in steps] for steps in ordered]
    if name == "sequence":
        return lambda o, s, u: float(o)
    if name == "proportional":
        return lambda o, s, u: u / orders[o].quantity
    if name == "spt":
        return lambda o, s, u: minutes[o][s]
    if name == "lpt":
        return lambda o, s, u: -minutes[o][s]
    if name == "remaining":
        rem = remaining_paths(orders, transfer)
        return lambda o, s, u: -rem[o][s]
    raise ValueError(name)


def genome_priority(genome: dict[tuple[int, int], float]) -> Priority:
    return lambda o, s, u: genome[(o, s)]


def _initial_genomes(orders: list[OrderSpec], transfer: float) -> dict[str, dict[tuple[int, int], float]]:
    """Rules that only depend on (order, step) can seed the search directly."""
    minutes = [[s.minutes for s in engine.topo_order(o.steps)] for o in orders]
    rem = remaining_paths(orders, transfer)
    keys = [(o, s) for o in range(len(orders)) for s in range(len(minutes[o]))]
    return {
        "fifo": {k: 0.0 for k in keys},
        "sequence": {(o, s): float(o) for o, s in keys},
        "spt": {(o, s): minutes[o][s] for o, s in keys},
        "lpt": {(o, s): -minutes[o][s] for o, s in keys},
        "remaining": {(o, s): -rem[o][s] for o, s in keys},
    }


def objective(result: SimResult) -> float:
    """Finish time first; average completion time breaks ties (units become ready sooner)."""
    units = sum(len(c) for c in result.completions) or 1
    return result.makespan + 1e-3 * sum(sum(c) for c in result.completions) / units


def evaluate(orders: list[OrderSpec], processes: dict[int, ProcessSpec], transfer: float, priority: Priority | None, variability: float = 0.0, seed: int = 0, record: bool = False) -> SimResult:
    return engine.simulate(orders, processes, transfer, variability, random.Random(seed), record, priority)


@dataclass
class SearchOutcome:
    genome: dict[tuple[int, int], float]
    start_rule: str
    start_makespan: float
    best_makespan: float
    iterations: int
    seconds: float
    history: list[list[float]] = field(default_factory=list)  # [iteration, best makespan]
    rule_results: dict[str, SimResult] = field(default_factory=dict)


def optimize(orders: list[OrderSpec], processes: dict[int, ProcessSpec], transfer: float, seed: int) -> SearchOutcome:
    """Hill climbing on per-(product, step) priorities, started from the best simple rule."""
    began = time.monotonic()
    rng = random.Random(seed)
    seeds = _initial_genomes(orders, transfer)
    rule_results: dict[str, SimResult] = {}
    scored: list[tuple[float, str]] = []
    for name in RULES:
        res = evaluate(orders, processes, transfer, rule_priority(name, orders, transfer))
        rule_results[name] = res
        if name in seeds:
            scored.append((objective(res), name))
    scored.sort()
    start_rule = scored[0][1]
    best = dict(seeds[start_rule])
    best_res = evaluate(orders, processes, transfer, genome_priority(best))
    best_score = objective(best_res)
    start_makespan = best_res.makespan
    history = [[0, best_res.makespan]]

    keys = list(best)
    iterations = 0
    current, current_score = dict(best), best_score
    while iterations < SEARCH_ITERATIONS and time.monotonic() - began < SEARCH_SECONDS and len(keys) > 1:
        iterations += 1
        candidate = dict(current)
        lo, hi = min(candidate.values()), max(candidate.values())
        span = max(hi - lo, 1.0)
        move = rng.random()
        k = rng.choice(keys)
        if move < 0.4:  # copy another step's priority, slightly shifted
            candidate[k] = candidate[rng.choice(keys)] + rng.uniform(-0.5, 0.5) * span * 0.1
        elif move < 0.8:  # random new priority
            candidate[k] = rng.uniform(lo - 0.2 * span, hi + 0.2 * span)
        else:  # swap two
            k2 = rng.choice(keys)
            candidate[k], candidate[k2] = candidate[k2], candidate[k]
        res = evaluate(orders, processes, transfer, genome_priority(candidate))
        score = objective(res)
        if score <= current_score:
            current, current_score = candidate, score
            if score < best_score - 1e-9:
                best, best_score, best_res = dict(candidate), score, res
                history.append([iterations, res.makespan])
        elif iterations % 60 == 0:  # drifted without gain: go back to the best known
            current, current_score = dict(best), best_score
    history.append([iterations, best_res.makespan])
    return SearchOutcome(best, start_rule, start_makespan, best_res.makespan, iterations, time.monotonic() - began, history, rule_results)
