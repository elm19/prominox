/**
 * Static knowledge the assistant can use when the "Company & app guide" source is on.
 * COMPANY is the part to edit: it only states what can be seen in the data, so add the real details
 * (history, sites, certifications, customers, contacts) to make answers about the company richer.
 */

export const COMPANY = `# About the company
Prominox is the name of this digital-factory platform and of the company it serves. From the data it holds, the factory
manufactures steel plate and welded pipe products: plate cutting, forming, seam welding, weld inspection and hydrostatic
testing are its main operations. Products are made in batches (production runs) that follow a routing of steps, each step
performed on a process (a machine or a manual workstation).

The platform's goal is to collect factory data (sensor readings, maintenance interventions, production history) and display it,
and to build a dataset that small prediction models and simulations can use.

(No further company details have been provided yet. If asked about history, locations, customers, certifications or contacts,
say that this information has not been added to the knowledge base.)`

export const APP_GUIDE = `# What the site contains
- Factory map: processes drawn by department; product flows can be overlaid.
- Departments: groups of processes.
- Processes: list of every process (machine or manual). A process page has five tabs:
  Telemetry (pick one sensor and explore its chart: time range presets, drag/scroll to zoom, overview strip),
  Overview (description, KPI snapshot, images, products that use it, latest AI failure-risk prediction),
  Sensors & live (define sensors; machines can enable RRT, real-time reception, where Node-RED pushes readings to a private ingest URL),
  Maintenance (log interventions), Data & export (add readings by form or bulk, download CSV).
- Products: catalogue with specs, files and a routing (steps on processes, with standard minutes per unit and dependencies between steps).
  Past production runs record quantities produced, scrap and actual step executions.
- Simulation: choose products and quantities, optionally switch processes off or change instances, set a fixed movement time and random
  time variation, then run. It tells whether the order is possible, how long it takes (this run, ideal, typical range), the bottleneck, and plays an
  animation either as process cards or as a blinking flow diagram.
- Maintenance: factory-wide logbook of interventions (inspection, preventive, corrective, calibration, lubrication).
- AI Lab: four small explainable models (see below).
- KPI guides: help pages explaining each KPI formula.
- My account: change password and email. Administrators also have Users (account management) and Data export (CSV of everything).
- This assistant: can look up live data with tools when the matching knowledge sources are enabled.

# Roles
Administrators manage accounts and bulk exports. Regular users can view and enter data.`

export const MODELS_GUIDE = `# The AI and simulation models (all small, explainable, fitted on demand to the factory's own data)
- Sensor forecast (AI Lab): predicts the next minutes/hours of a numeric sensor. It tests four models on data hidden from them:
  repeat last value, linear trend, autoregressive with 2 lags, autoregressive with 6 lags. The most accurate is used and the result shows a likely
  range (about 80%) plus whether it beats simply repeating the last value (quality: reliable / rough / unreliable).
- Anomaly detection (AI Lab): compares each reading with the rolling median of its neighbours and divides the gap by the typical gap
  (robust z-score). Sensitivity low/medium/high flags above 6x / 4.5x / 3.5x. True/false and text sensors are checked for values seen in under 2% of readings.
- Failure risk (AI Lab): uses logs of type "corrective" as failures. The time between failures is fitted with a Weibull distribution. With the time
  since the last failure it gives the chance of another corrective intervention in the next 14 days and the median time until it.
  Over 25% is "watch", over 50% is "service soon". Needs at least 3 corrective logs. Results can be published to the process page.
- Production estimate (AI Lab): least-squares line of lead time against batch size from past runs, with an 80% prediction interval, plus the average scrap
  share. Needs at least 5 runs of the product.
- Production simulation: discrete-event simulation built with SimPy. Every unit goes through the routing; a step starts when the steps it depends on are done
  (plus a fixed movement time if they ran on different processes). Each process instance works one unit at a time by default (or "capacity" units at once if chosen);
  capacity 0 means unlimited. Step durations vary randomly; 30 repeated runs give the typical range. The factory is assumed to run continuously (no shifts).
  A process that is inactive (or switched off) blocks every product that needs it.
  Scheduling strategies decide who gets a free machine first: first come first served, one product after another, evenly mixed, shortest/longest operation first,
  most work remaining first, or "optimized" (a search over per-product, per-step priorities that starts from the best simple rule and keeps improving). Each run
  is scored: total time, efficiency (theoretical minimum time / actual time), machine load, output per hour, average and longest wait, units in progress, load
  imbalance. A comparison table runs every strategy on the same order and random luck. The simulation also says what one more instance of the busiest
  machines would save, because when the bottleneck machine sets the pace, scheduling alone cannot go faster.`

export const DOCS_TEXT = [COMPANY, APP_GUIDE, MODELS_GUIDE].join("\n\n")
