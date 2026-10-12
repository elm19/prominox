"""Discrete-event simulation (SimPy) of production orders flowing through product routings.

Model
- Every unit of every order goes through all steps of its product's routing.
- A step can start for a unit once the steps it depends on are finished for that unit (plus a fixed
  transfer time when they ran on a different process).
- A process works on one unit per instance at a time (or `instances x capacity` units in "parallel" mode). Capacity 0 is "dynamic": unlimited.
- A step takes `minutes` per unit on one slot, randomly varied around that value.
- Units waiting for a free slot are served by priority (lowest value first), first-come-first-served among equal priorities.
  The priority comes from the chosen dispatch strategy (see strategies.py). The factory runs continuously (no shifts).
"""
import random
from dataclasses import dataclass, field
from typing import Callable

import simpy


@dataclass
class StepSpec:
    id: int
    name: str
    process_id: int
    minutes: float
    deps: list[int]  # step ids


@dataclass
class ProcessSpec:
    id: int
    name: str
    code: str | None
    status: str
    capacity: int
    instances: int
    enabled: bool
    parallel: bool = False  # capacity = units worked on at once per instance; otherwise one unit per instance

    @property
    def slots(self) -> int | None:
        """None means unlimited (dynamic capacity)."""
        if self.capacity == 0:
            return None
        return self.instances * self.capacity if self.parallel else self.instances


@dataclass
class OrderSpec:
    product_id: int
    quantity: int
    steps: list[StepSpec]  # any order


@dataclass
class ProcessStats:
    busy: float = 0.0
    wait: float = 0.0
    tasks: int = 0


@dataclass
class SimResult:
    makespan: float
    finish: list[float]                     # per order
    first_done: list[float]                 # per order
    completions: list[list[float]]          # per order: sorted finish times of every unit
    stats: dict[int, ProcessStats]
    unit_first_start: list[list[float]] = field(default_factory=list)  # per order, per unit
    unit_done_times: list[list[float]] = field(default_factory=list)   # per order, per unit (same order as unit_first_start)
    max_wait: float = 0.0
    trace: list[list[float]] = field(default_factory=list)  # [order, unit, step, slot, avail, ready, start, end]


def topo_order(steps: list[StepSpec]) -> list[StepSpec]:
    by_id = {s.id: s for s in steps}
    done: list[StepSpec] = []
    seen: set[int] = set()

    def visit(step: StepSpec) -> None:
        if step.id in seen:
            return
        seen.add(step.id)
        for dep in step.deps:
            if dep in by_id:
                visit(by_id[dep])
        done.append(step)

    for step in steps:
        visit(step)
    return done


def blockers(order: OrderSpec, processes: dict[int, ProcessSpec]) -> list[tuple[int, str, list[str]]]:
    """(process id, reason, step names) for every process this order needs but cannot use."""
    found: dict[int, tuple[str, list[str]]] = {}
    for step in order.steps:
        process = processes.get(step.process_id)
        if process is None:
            reason = "missing"
        elif not process.enabled:
            reason = "off"
        elif process.slots == 0:
            reason = "no capacity"
        else:
            continue
        found.setdefault(step.process_id, (reason, []))[1].append(step.name)
    return [(pid, reason, names) for pid, (reason, names) in found.items()]


def critical_path(steps: list[StepSpec], processes: dict[int, ProcessSpec], transfer: float) -> float:
    """Time for a single unit with no waiting and no randomness."""
    by_id = {s.id: s for s in steps}
    end: dict[int, float] = {}
    for step in topo_order(steps):
        start = 0.0
        for dep in step.deps:
            if dep in by_id:
                gap = transfer if by_id[dep].process_id != step.process_id else 0.0
                start = max(start, end[dep] + gap)
        end[step.id] = start + step.minutes
    return max(end.values(), default=0.0)


# priority(order index, step position in topological order, unit index) -> lower is served first
Priority = Callable[[int, int, int], float]


def simulate(
    orders: list[OrderSpec],
    processes: dict[int, ProcessSpec],
    transfer: float,
    variability: float,
    rng: random.Random,
    record: bool,
    priority: Priority | None = None,
) -> SimResult:
    """Runs the orders through SimPy: one SimPy process per (unit, step), one priority resource per process."""
    env = simpy.Environment()
    resources: dict[int, simpy.PriorityResource] = {}
    free_slots: dict[int, list[int]] = {}
    for pid, process in processes.items():
        if process.slots:
            resources[pid] = simpy.PriorityResource(env, capacity=process.slots)
            free_slots[pid] = list(range(process.slots))

    stats = {pid: ProcessStats() for pid in processes}
    trace: list[list[float]] = []
    ordered = [topo_order(o.steps) for o in orders]
    unit_done = [[0.0] * o.quantity for o in orders]
    unit_first = [[float("inf")] * o.quantity for o in orders]
    final_ids = [{s.id for s in o.steps if not any(s.id in other.deps for other in o.steps)} for o in orders]
    max_wait = [0.0]

    # Duration noise is drawn up front in a fixed order, so two strategies given the same seed face the same "luck"
    factors: list[list[list[float]]] = []
    for oi, (order, steps) in enumerate(zip(orders, ordered)):
        factors.append([
            [max(0.2, 1 + rng.gauss(0, variability)) if variability > 0 else 1.0 for _ in steps]
            for _ in range(order.quantity)
        ])

    def task(oi: int, unit: int, si: int, step: StepSpec, deps: list[tuple[StepSpec, simpy.Event]], finished: simpy.Event):
        process = processes[step.process_id]
        avail = ready = 0.0
        if deps:
            yield simpy.AllOf(env, [event for _, event in deps])
            avail = env.now
            # Each dependency finished at its own time; moving between processes costs a fixed transfer time
            ready = max(event.value + (transfer if dep.process_id != step.process_id else 0.0) for dep, event in deps)
            if ready > env.now:
                yield env.timeout(ready - env.now)
        minutes = step.minutes * factors[oi][unit][si]

        slot = -1
        resource = resources.get(process.id)
        request = None
        if resource is not None:
            request = resource.request(priority=priority(oi, si, unit) if priority else 0.0)
            yield request
            slot = free_slots[process.id].pop(0)
        start = env.now
        yield env.timeout(minutes)
        end = env.now
        if resource is not None:
            free_slots[process.id].append(slot)
            resource.release(request)

        st = stats[process.id]
        st.busy += minutes
        st.wait += start - ready
        st.tasks += 1
        if start - ready > max_wait[0]:
            max_wait[0] = start - ready
        if start < unit_first[oi][unit]:
            unit_first[oi][unit] = start
        if record:
            trace.append([oi, unit, si, slot, round(avail, 2), round(ready, 2), round(start, 2), round(end, 2)])
        if step.id in final_ids[oi] and end > unit_done[oi][unit]:
            unit_done[oi][unit] = end
        finished.succeed(end)

    for oi, (order, steps) in enumerate(zip(orders, ordered)):
        for unit in range(order.quantity):
            events = {s.id: simpy.Event(env) for s in steps}
            for si, step in enumerate(steps):
                deps = [(dep, events[dep.id]) for dep in steps if dep.id in step.deps]
                env.process(task(oi, unit, si, step, deps, events[step.id]))
    env.run()

    completions = [sorted(done) for done in unit_done]
    finish = [done[-1] if done else 0.0 for done in completions]
    return SimResult(
        makespan=max(finish, default=0.0),
        finish=finish,
        first_done=[done[0] if done else 0.0 for done in completions],
        completions=completions,
        stats=stats,
        trace=trace,
        unit_first_start=unit_first,
        unit_done_times=unit_done,
        max_wait=max_wait[0],
    )


def lower_bound(orders: list[OrderSpec], processes: dict[int, ProcessSpec], transfer: float) -> float:
    """No schedule can finish sooner than the slowest single unit, or than the busiest process's work spread over its slots."""
    longest_unit = max((critical_path(o.steps, processes, transfer) for o in orders), default=0.0)
    work: dict[int, float] = {}
    for o in orders:
        for s in o.steps:
            work[s.process_id] = work.get(s.process_id, 0.0) + s.minutes * o.quantity
    per_process = max((w / processes[pid].slots for pid, w in work.items() if processes[pid].slots), default=0.0)
    return max(longest_unit, per_process)


def metrics(result: SimResult, orders: list[OrderSpec], processes: dict[int, ProcessSpec], bound: float) -> dict[str, float]:
    span = result.makespan
    units = sum(o.quantity for o in orders)
    tasks = sum(st.tasks for st in result.stats.values())
    finite = {pid: st for pid, st in result.stats.items() if processes[pid].slots and st.tasks}
    util = {pid: st.busy / (processes[pid].slots * span) * 100 for pid, st in finite.items()} if span > 0 else {}
    capacity = sum(processes[pid].slots * span for pid in finite)
    completions = [t for c in result.completions for t in c]
    in_system = sum(done - first for done_list, first_list in zip(result.unit_done_times, result.unit_first_start) for done, first in zip(done_list, first_list))
    return {
        "makespan_minutes": span,
        "throughput_per_hour": units / (span / 60) if span > 0 else 0.0,
        "avg_utilization_pct": sum(finite[pid].busy for pid in finite) / capacity * 100 if capacity > 0 else 0.0,
        "bottleneck_utilization_pct": max(util.values(), default=0.0),
        "utilization_spread_pct": (max(util.values()) - min(util.values())) if util else 0.0,
        "avg_unit_completion_minutes": sum(completions) / len(completions) if completions else 0.0,
        "avg_wait_minutes": sum(st.wait for st in result.stats.values()) / tasks if tasks else 0.0,
        "max_wait_minutes": result.max_wait,
        "total_wait_hours": sum(st.wait for st in result.stats.values()) / 60,
        "avg_wip_units": in_system / span if span > 0 else 0.0,
        "lower_bound_minutes": bound,
        "efficiency_pct": min(100.0, bound / span * 100) if span > 0 else 0.0,
    }
