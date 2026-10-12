"""Seed realistic data for the Prominox digital twin (stainless / black steel pipe maker).

Run from back-end/:
    python -m scripts.seed           # add the data (skips if processes already exist)
    python -m scripts.seed --reset   # wipe all factory data first (users and the audit log are kept)

The plant: four departments (forge, coupage, assemblage, noir). Most of it works stainless steel ("inox");
the noir department works black (uncoated carbon) steel.
"""
import random
import sys
from datetime import datetime, timedelta, timezone

from app.database import SessionLocal
from app.models import (
    DepartmentDB, MaintenanceLogDB, ProcessDB, ProcessSensorDB, ProductDB, ProductSpecDB, ProductStepDB,
    ProductionRunDB, ProductionRunStepDB, SensorReadingDB,
)

DEPARTMENTS = {
    "Forge": "Machining shop: universal lathes, milling machines and drilling machines (flanges, fittings, parts)",
    "Coupage": "Cutting and forming: band saws, shear, laser and plasma cutting, press brakes and plate rolls",
    "Assemblage": "Welding and assembly of stainless steel, with visual, radiographic and penetrant quality control",
    "Noir": "Black steel pipes: sawing, beveling, submerged-arc welding, hydrostatic test, varnishing and packing",
}

# Sensor: (name, data_type, description, idle, running, noise)
#   number : idle/running = typical value when the machine is stopped / working, noise = standard deviation
#   boolean: idle/running = probability of true when stopped / working
#   text   : idle = list of values (the machine shows "Standby" when stopped), the others are unused
# Process: (code, name, type, department, capacity, instances, utilization, description, sensors)
# Capacity = units one instance works on at once (0 = dynamic, no fixed limit).
PROCESSES = [
    # ---- Forge ----
    ("FRG-TU", "Tour universel", "machine", "Forge", 1, 3, 0.60, "Universal lathe: turning of flanges, bushes and shafts", [
        ("Spindle speed (rpm)", "number", None, 0, 680, 25),
        ("Spindle motor current (A)", "number", None, 2, 14, 1.2),
        ("Spindle bearing temperature (°C)", "number", "Front spindle bearing", 24, 52, 1.0),
        ("Vibration (mm/s)", "number", "RMS vibration at the headstock", 0.4, 1.8, 0.2),
        ("Chuck guard closed", "boolean", "Safety interlock of the chuck guard", 0.5, 0.98, 0)]),
    ("FRG-FR", "Fraiseuse universelle", "machine", "Forge", 1, 2, 0.45, "Universal milling machine: faces, slots and raised faces", [
        ("Spindle speed (rpm)", "number", None, 0, 1200, 60),
        ("Spindle temperature (°C)", "number", None, 24, 58, 1.2),
        ("Table feed rate (mm/min)", "number", None, 0, 220, 15),
        ("Coolant temperature (°C)", "number", None, 22, 31, 0.6),
        ("Vibration (mm/s)", "number", None, 0.5, 2.2, 0.25)]),
    ("FRG-PE", "Perceuse", "machine", "Forge", 1, 2, 0.40, "Drilling machine: bolt holes and bores", [
        ("Spindle speed (rpm)", "number", None, 0, 900, 40),
        ("Drill motor current (A)", "number", None, 1, 9, 0.8),
        ("Spindle temperature (°C)", "number", None, 23, 44, 0.9),
        ("Vibration (mm/s)", "number", None, 0.3, 1.4, 0.15)]),

    # ---- Coupage ----
    ("CPG-SR", "Scie à ruban", "machine", "Coupage", 1, 3, 0.70, "Band saw: cutting tube and bar to length", [
        ("Blade speed (m/min)", "number", None, 0, 75, 3),
        ("Motor current (A)", "number", None, 1.5, 11, 1.0),
        ("Coolant temperature (°C)", "number", None, 22, 33, 0.7),
        ("Vibration (mm/s)", "number", None, 0.5, 2.4, 0.25),
        ("Blade tension OK", "boolean", None, 0.9, 0.99, 0)]),
    ("CPG-CG", "Cisaille guillotine", "machine", "Coupage", 1, 1, 0.35, "Hydraulic guillotine shear for sheet and plate", [
        ("Hydraulic pressure (bar)", "number", None, 25, 180, 6),
        ("Hydraulic oil temperature (°C)", "number", None, 28, 48, 0.8),
        ("Motor current (A)", "number", None, 3, 28, 2),
        ("Light curtain OK", "boolean", "Safety light curtain at the back gauge", 0.95, 0.99, 0)]),
    ("CPG-LS", "Découpe laser fibre", "machine", "Coupage", 1, 1, 0.88, "Fibre laser cutting table (sheet up to 20 mm)", [
        ("Laser output power (kW)", "number", None, 0, 6.0, 0.15),
        ("Assist gas pressure (bar)", "number", "Nitrogen for stainless, oxygen for carbon steel", 0.5, 14, 0.5),
        ("Chiller water temperature (°C)", "number", "Laser source cooling circuit", 20, 23.5, 0.3),
        ("Cutting speed (m/min)", "number", None, 0, 8.5, 1.2),
        ("Laser emission on", "boolean", None, 0, 0.55, 0),
        ("Cutting program", "text", "Name of the running nesting program",
         ["INOX-304L-3MM", "INOX-316L-2MM", "INOX-304L-1.5MM", "TOLE-NOIRE-6MM"], None, None)]),
    ("CPG-PL", "Découpe plasma", "machine", "Coupage", 1, 1, 0.65, "Plasma cutting table for thick plate", [
        ("Arc current (A)", "number", None, 0, 130, 8),
        ("Arc voltage (V)", "number", None, 0, 145, 5),
        ("Plasma gas pressure (bar)", "number", None, 1, 6.5, 0.2),
        ("Cutting speed (m/min)", "number", None, 0, 2.2, 0.3),
        ("Arc on", "boolean", None, 0, 0.5, 0)]),
    ("CPG-PH", "Plieuse", "machine", "Coupage", 1, 2, 0.55, "CNC press brake: bending of sheet metal and profiles", [
        ("Hydraulic pressure (bar)", "number", None, 30, 210, 10),
        ("Bending force (kN)", "number", None, 0, 850, 90),
        ("Hydraulic oil temperature (°C)", "number", None, 27, 50, 0.8),
        ("Light curtain OK", "boolean", None, 0.95, 0.99, 0)]),
    ("CPG-RT", "Rouleuse à tôle", "machine", "Coupage", 1, 1, 0.75, "Plate rolls: forming a cut strip into an open tube", [
        ("Roll motor current (A)", "number", None, 2, 32, 3),
        ("Hydraulic pressure (bar)", "number", None, 20, 160, 8),
        ("Roll speed (rpm)", "number", None, 0, 9, 0.8)]),

    # ---- Assemblage ----
    ("ASM-TIG", "Soudage TIG", "machine", "Assemblage", 1, 6, 0.78, "TIG (GTAW) stations: stainless welds, fittings and flanges", [
        ("Welding current (A)", "number", None, 0, 95, 8),
        ("Arc voltage (V)", "number", None, 0, 12, 0.8),
        ("Argon flow (L/min)", "number", None, 0, 10, 0.5),
        ("Arc on", "boolean", None, 0, 0.6, 0)]),
    ("ASM-MIG", "Soudage MIG/MAG", "machine", "Assemblage", 1, 4, 0.55, "MIG/MAG stations: structural and carbon steel welds", [
        ("Welding current (A)", "number", None, 0, 210, 12),
        ("Arc voltage (V)", "number", None, 0, 24, 1.0),
        ("Wire feed speed (m/min)", "number", None, 0, 8.5, 0.4),
        ("Gas flow (L/min)", "number", None, 0, 16, 0.8),
        ("Arc on", "boolean", None, 0, 0.6, 0)]),
    ("ASM-MMA", "Soudage à l'électrode enrobée", "machine", "Assemblage", 1, 2, 0.30, "Stick welding (SMAW): repairs and site-type joints", [
        ("Welding current (A)", "number", None, 0, 125, 10),
        ("Arc on", "boolean", None, 0, 0.5, 0)]),
    ("ASM-LGT", "Soudage longitudinal automatique", "machine", "Assemblage", 1, 2, 0.85, "Automatic longitudinal seam welding of tubes (TIG / plasma)", [
        ("Welding current (A)", "number", None, 0, 185, 6),
        ("Arc voltage (V)", "number", None, 0, 13, 0.6),
        ("Travel speed (m/min)", "number", None, 0, 1.3, 0.1),
        ("Shielding gas flow (L/min)", "number", None, 0, 14, 0.8),
        ("Torch cooling water temperature (°C)", "number", None, 22, 31, 0.6),
        ("Arc on", "boolean", None, 0, 0.7, 0)]),
    ("ASM-ORB", "Soudage orbital", "machine", "Assemblage", 1, 1, 0.40, "Orbital TIG welding head for tube-to-tube butt joints", [
        ("Welding current (A)", "number", None, 0, 110, 4),
        ("Arc voltage (V)", "number", None, 0, 11, 0.5),
        ("Argon purge flow (L/min)", "number", "Internal purge of the tube", 0, 8, 0.4),
        ("Arc on", "boolean", None, 0, 0.55, 0)]),
    ("ASM-MEC", "Assemblage mécanique", "manual", "Assemblage", 1, 2, 0.35, "Bolted and flanged assemblies, gasket and fit checks", []),
    ("ASM-CQV", "Contrôle visuel", "manual", "Assemblage", 1, 3, 0.70, "Visual inspection of welds, surface finish and dimensions", []),
    ("ASM-CQR", "Contrôle radiographique", "machine", "Assemblage", 1, 1, 0.35, "Radiographic testing (RT) of welds in a shielded cabin", [
        ("Tube voltage (kV)", "number", None, 0, 220, 3),
        ("Tube current (mA)", "number", None, 0, 5, 0.1),
        ("Cabin door closed", "boolean", "Radiation shielding door interlock", 0.6, 1.0, 0),
        ("X-ray emission on", "boolean", None, 0, 0.35, 0)]),
    ("ASM-CQP", "Ressuage", "manual", "Assemblage", 1, 1, 0.45, "Liquid penetrant testing (PT) of stainless welds", []),

    # ---- Noir ----
    ("NOI-SR", "Scie à ruban (tube noir)", "machine", "Noir", 1, 2, 0.60, "Band saw for black steel tube", [
        ("Blade speed (m/min)", "number", None, 0, 60, 3),
        ("Motor current (A)", "number", None, 2, 15, 1.2),
        ("Vibration (mm/s)", "number", None, 0.6, 2.8, 0.3)]),
    ("NOI-CH", "Chanfreineuse", "machine", "Noir", 1, 1, 0.55, "Pipe end beveling machine", [
        ("Beveling motor current (A)", "number", None, 1, 18, 1.5),
        ("Spindle speed (rpm)", "number", None, 0, 180, 8),
        ("Vibration (mm/s)", "number", None, 0.4, 2.0, 0.2)]),
    ("NOI-SAW", "Soudage à l'arc submergé", "machine", "Noir", 1, 1, 0.80, "Submerged-arc welding (SAW) of black steel pipe seams", [
        ("Welding current (A)", "number", None, 0, 620, 18),
        ("Arc voltage (V)", "number", None, 0, 31, 1.0),
        ("Travel speed (m/min)", "number", None, 0, 0.9, 0.05),
        ("Wire feed speed (m/min)", "number", None, 0, 1.8, 0.1),
        ("Arc on", "boolean", None, 0, 0.7, 0)]),
    ("NOI-HYD", "Banc d'épreuve hydraulique", "machine", "Noir", 1, 1, 0.50, "Hydrostatic test bench for pipes", [
        ("Test pressure (bar)", "number", None, 0, 85, 3),
        ("Pump motor current (A)", "number", None, 1, 22, 1.5),
        ("Water temperature (°C)", "number", None, 17, 19, 0.3),
        ("Test in progress", "boolean", None, 0, 0.4, 0)]),
    ("NOI-VRN", "Vernissage antirouille", "manual", "Noir", 1, 2, 0.60, "Rust-preventive varnish / oil coating of black pipes", []),
    ("NOI-EMB", "Marquage et conditionnement", "manual", "Noir", 0, 3, 0.70, "Marking, bundling and packing for shipment (no fixed limit)", []),
]

# Open issues behind the maintenance logs: a sensor slowly drifting over the last 48 h (final deviation)
DRIFT = {
    ("CPG-LS", "Chiller water temperature (°C)"): 3.5,
    ("ASM-LGT", "Shielding gas flow (L/min)"): -3.0,
    ("NOI-HYD", "Pump motor current (A)"): 5.0,
}

# process code, days ago, type, description, status, downtime hours, technician
LOGS = [
    ("CPG-LS", 1, "inspection", "Chiller outlet temperature creeping up, heat exchanger clogged suspected.", "in_progress", 0.5, "Yacine Haddad"),
    ("CPG-LS", 21, "preventive", "Replaced protective window and cleaned the cutting head nozzle.", "solved", 1.0, "Yacine Haddad"),
    ("CPG-LS", 75, "calibration", "Nozzle centering and capacitive height sensor calibration.", "solved", 1.5, "Karim Benali"),
    ("ASM-LGT", 2, "inspection", "Argon flow drops during long seams, regulator or hose leak suspected.", "in_progress", 0.8, "Samir Touati"),
    ("ASM-LGT", 34, "corrective", "Replaced worn tungsten holder and torch cooling hose.", "solved", 2.5, "Samir Touati"),
    ("NOI-HYD", 4, "inspection", "High-pressure pump drawing more current than usual.", "pending", 0.0, None),
    ("NOI-HYD", 48, "corrective", "Seal leak on the test head, replaced the seal kit.", "solved", 5.5, "Karim Benali"),
    ("CPG-PH", 9, "lubrication", "Hydraulic oil change and filter replacement.", "solved", 2.0, "Nadia Cherif"),
    ("CPG-PH", 90, "calibration", "Back gauge and ram parallelism calibration.", "solved", 3.0, "Karim Benali"),
    ("CPG-RT", 14, "preventive", "Greased roll bearings and checked the hydraulic hoses.", "solved", 1.5, "Nadia Cherif"),
    ("CPG-SR", 6, "corrective", "Blade broke on a 316L bar, replaced the blade and guides.", "solved", 1.2, "Samir Touati"),
    ("CPG-PL", 17, "preventive", "Replaced electrode, nozzle and swirl ring.", "solved", 0.7, "Yacine Haddad"),
    ("FRG-TU", 11, "lubrication", "Headstock oil change and way lubrication check.", "solved", 1.0, "Nadia Cherif"),
    ("FRG-FR", 27, "corrective", "Table feed backlash adjusted on the X axis.", "solved", 2.0, "Karim Benali"),
    ("ASM-CQR", 60, "calibration", "X-ray tube warm-up and exposure chart calibration, shielding survey.", "solved", 4.0, "Yacine Haddad"),
    ("ASM-ORB", 40, "preventive", "Cleaned the orbital head and replaced the rotor brushes.", "solved", 1.5, "Samir Touati"),
    ("NOI-SAW", 13, "preventive", "Flux recovery system cleaned, wire feed rollers replaced.", "solved", 2.0, "Karim Benali"),
    ("NOI-CH", 30, "corrective", "Replaced beveling insert set.", "solved", 0.8, "Nadia Cherif"),
]

OPERATORS = [
    "Amine Boudiaf", "Sofiane Mansouri", "Meriem Belkacem", "Rachid Messaoud",
    "Lydia Hamdi", "Walid Zerrouki", "Farid Amrani", "Imane Slimani",
]

# Step: (key, name, process code, minutes per unit, [dependency keys], max scrap fraction)
# Product: (reference, name, category, material, standard, unit, color, quantity range, specs, steps)
PRODUCTS = [
    ("TI-304L-60x2", "Stainless welded tube Ø60.3×2.0", "Stainless tubes", "1.4307 (304L)", "EN 10217-7", "piece", "#38bdf8", (120, 400),
     [("Outer diameter", "60.3", "mm"), ("Wall thickness", "2.0", "mm"), ("Length", "6000", "mm"), ("Weight", "2.91", "kg/m")],
     [("cut", "Strip cutting (laser)", "CPG-LS", 1.6, [], 0.01), ("roll", "Rolling to tube", "CPG-RT", 2.4, ["cut"], 0.01),
      ("weld", "Longitudinal seam weld", "ASM-LGT", 3.2, ["roll"], 0.025), ("rt", "Radiographic inspection", "ASM-CQR", 4.5, ["weld"], 0.015),
      ("saw", "Cut to length", "CPG-SR", 1.2, ["weld"], 0.005), ("visual", "Visual inspection", "ASM-CQV", 1.5, ["saw"], 0.01)]),
    ("TI-316L-89x2.6", "Stainless welded tube Ø88.9×2.6", "Stainless tubes", "1.4404 (316L)", "EN 10217-7", "piece", "#a78bfa", (80, 250),
     [("Outer diameter", "88.9", "mm"), ("Wall thickness", "2.6", "mm"), ("Length", "6000", "mm"), ("Weight", "5.63", "kg/m")],
     [("cut", "Strip cutting (plasma)", "CPG-PL", 2.0, [], 0.01), ("roll", "Rolling to tube", "CPG-RT", 3.0, ["cut"], 0.01),
      ("weld", "Seam weld (TIG)", "ASM-TIG", 6.5, ["roll"], 0.03), ("pt", "Penetrant test", "ASM-CQP", 4.0, ["weld"], 0.01),
      ("rt", "Radiographic inspection", "ASM-CQR", 5.5, ["weld"], 0.02), ("visual", "Visual inspection", "ASM-CQV", 2.0, ["pt", "rt"], 0.01)]),
    ("TI-304L-C40x2", "Stainless square tube 40×40×2.0", "Stainless tubes", "1.4307 (304L)", "EN 10296-2", "piece", "#2dd4bf", (150, 500),
     [("Side", "40", "mm"), ("Wall thickness", "2.0", "mm"), ("Length", "6000", "mm"), ("Weight", "2.34", "kg/m")],
     [("cut", "Strip cutting (laser)", "CPG-LS", 1.2, [], 0.01), ("bend", "Profile bending", "CPG-PH", 3.5, ["cut"], 0.015),
      ("weld", "Longitudinal seam weld", "ASM-LGT", 2.8, ["bend"], 0.025), ("saw", "Cut to length", "CPG-SR", 1.0, ["weld"], 0.005),
      ("visual", "Visual inspection", "ASM-CQV", 1.2, ["saw"], 0.01)]),
    ("CO-304L-90-60", "Welded 90° elbow Ø60.3 (304L)", "Stainless fittings", "1.4307 (304L)", "EN 10253-4", "piece", "#fb7185", (60, 250),
     [("Outer diameter", "60.3", "mm"), ("Wall thickness", "2.0", "mm"), ("Angle", "90", "°"), ("Radius", "1.5 D", None)],
     [("saw", "Mitre cutting of segments", "CPG-SR", 2.0, [], 0.01), ("weld", "Segment welding (TIG)", "ASM-TIG", 9.0, ["saw"], 0.04),
      ("pt", "Penetrant test", "ASM-CQP", 3.5, ["weld"], 0.015), ("visual", "Visual inspection", "ASM-CQV", 1.5, ["pt"], 0.01)]),
    ("BR-304L-DN50", "Stainless flange DN50 PN16", "Stainless fittings", "1.4307 (304L)", "EN 1092-1", "piece", "#f59e0b", (100, 400),
     [("Nominal diameter", "DN50", None), ("Pressure rating", "PN16", None), ("Outer diameter", "165", "mm"), ("Bolt holes", "4 × Ø18", None)],
     [("cut", "Blank cutting (laser)", "CPG-LS", 1.0, [], 0.01), ("turn", "Turning (faces and bore)", "FRG-TU", 7.5, ["cut"], 0.02),
      ("drill", "Bolt hole drilling", "FRG-PE", 4.0, ["turn"], 0.01), ("mill", "Raised face milling", "FRG-FR", 3.0, ["turn"], 0.01),
      ("visual", "Dimensional check", "ASM-CQV", 1.0, ["drill", "mill"], 0.01)]),
    ("TB-304L-DN50", "Stainless flanged tube DN50", "Stainless fittings", "1.4307 (304L)", "EN 10217-7 / EN 1092-1", "piece", "#34d399", (40, 180),
     [("Nominal diameter", "DN50", None), ("Length", "1000", "mm"), ("Flange", "PN16, one end", None)],
     [("saw", "Cut to length", "CPG-SR", 1.5, [], 0.005), ("weld", "Flange welding (TIG)", "ASM-TIG", 11.0, ["saw"], 0.035),
      ("mec", "Mechanical assembly and fit check", "ASM-MEC", 4.0, ["weld"], 0.01), ("pt", "Penetrant test", "ASM-CQP", 3.5, ["weld"], 0.015),
      ("visual", "Visual inspection", "ASM-CQV", 1.5, ["mec", "pt"], 0.01)]),
    ("PL-304L-3-PLIE", "Folded stainless part, 3 mm", "Stainless parts", "1.4301 (304)", "Customer drawing", "piece", "#e879f9", (100, 600),
     [("Thickness", "3", "mm"), ("Developed length", "420", "mm"), ("Bends", "2", None)],
     [("cut", "Blank cutting (laser)", "CPG-LS", 0.8, [], 0.01), ("bend", "Bending", "CPG-PH", 2.2, ["cut"], 0.02),
      ("visual", "Visual inspection", "ASM-CQV", 0.8, ["bend"], 0.01)]),
    ("TN-S235-114x3.6", "Black welded steel tube Ø114.3×3.6", "Black steel tubes", "S235JR", "EN 10217-1", "piece", "#94a3b8", (100, 350),
     [("Outer diameter", "114.3", "mm"), ("Wall thickness", "3.6", "mm"), ("Length", "6000", "mm"), ("Weight", "9.83", "kg/m")],
     [("cut", "Strip cutting (plasma)", "CPG-PL", 2.2, [], 0.01), ("roll", "Rolling to tube", "CPG-RT", 2.8, ["cut"], 0.01),
      ("weld", "Seam welding (SAW)", "NOI-SAW", 4.0, ["roll"], 0.02), ("bevel", "End beveling", "NOI-CH", 1.4, ["weld"], 0.005),
      ("hydro", "Hydrostatic test", "NOI-HYD", 3.5, ["bevel"], 0.01), ("varnish", "Varnishing", "NOI-VRN", 1.3, ["hydro"], 0.005),
      ("pack", "Marking and packing", "NOI-EMB", 0.9, ["varnish"], 0.0)]),
    ("TN-S355-168x4.5", "Structural black tube Ø168.3×4.5", "Black steel tubes", "S355J2H", "EN 10219-1", "piece", "#f97316", (60, 220),
     [("Outer diameter", "168.3", "mm"), ("Wall thickness", "4.5", "mm"), ("Length", "12000", "mm"), ("Weight", "18.18", "kg/m")],
     [("cut", "Strip cutting (plasma)", "CPG-PL", 3.0, [], 0.01), ("roll", "Rolling to tube", "CPG-RT", 4.2, ["cut"], 0.01),
      ("weld", "Seam welding (SAW)", "NOI-SAW", 6.5, ["roll"], 0.02), ("saw", "Cut to length", "NOI-SR", 1.8, ["weld"], 0.005),
      ("bevel", "End beveling", "NOI-CH", 2.2, ["saw"], 0.005), ("rt", "Radiographic inspection", "ASM-CQR", 6.0, ["weld"], 0.015),
      ("visual", "Visual inspection", "ASM-CQV", 2.0, ["bevel", "rt"], 0.01), ("varnish", "Varnishing", "NOI-VRN", 1.8, ["visual"], 0.005),
      ("pack", "Marking and packing", "NOI-EMB", 1.2, ["varnish"], 0.0)]),
]

SLOT_MINUTES = 30
HISTORY_HOURS = 48
RUNS_PER_PRODUCT = 8


def in_shift(ts: datetime) -> bool:
    """Two shifts, 06:00-22:00, Monday to Friday; Saturday morning only."""
    if ts.weekday() == 6:
        return False
    return 6 <= ts.hour < (14 if ts.weekday() == 5 else 22)


def busy_series(rng: random.Random, start: datetime, slots: int, utilization: float) -> list[bool]:
    """Machine working / stopped per slot: a two-state chain with the given long-run utilization during shifts."""
    stay_busy = 0.9
    u = min(utilization, 0.95)
    start_busy = (1 - stay_busy) * u / (1 - u)
    busy = False
    out = []
    for i in range(slots):
        if not in_shift(start + timedelta(minutes=SLOT_MINUTES * i)):
            busy = False
        else:
            busy = rng.random() < (stay_busy if busy else start_busy)
        out.append(busy)
    return out


def sensor_readings(rng: random.Random, process, sensors_spec, start: datetime, busy: list[bool]) -> list[SensorReadingDB]:
    slots = len(busy)
    rows = []
    for sensor, (name, dtype, _, idle, running, noise) in zip(process.sensors, sensors_spec):
        lag = "temperature" in name.lower()
        level = 0.0
        drift = DRIFT.get((process.code, name), 0.0)
        for i, is_busy in enumerate(busy):
            ts = start + timedelta(minutes=SLOT_MINUTES * i)
            row = SensorReadingDB(process_id=process.id, sensor_id=sensor.id, recorded_at=ts)
            if dtype == "number":
                # Temperatures follow the load slowly; other values follow it directly
                target = 1.0 if is_busy else 0.0
                level = level + 0.25 * (target - level) if lag else target * (0.92 + 0.08 * rng.random())
                value = idle + (running - idle) * level + rng.gauss(0, noise)
                ratio = i / (slots - 1)
                value += drift * ratio ** 2 * (1.0 if lag else level)
                row.value_number = round(max(value, 0.0), 2)
            elif dtype == "boolean":
                row.value_bool = rng.random() < idle + (running - idle) * (1.0 if is_busy else 0.0)
            else:
                row.value_text = idle[(i // 16) % len(idle)] if is_busy else "Standby"
            rows.append(row)
    return rows


def reset(db) -> None:
    """Remove all factory data. Users and the audit log are left alone."""
    db.query(ProductDB).delete()  # cascades to specs, steps, files, runs and run steps
    db.query(ProcessDB).delete()  # cascades to sensors, readings, images, maintenance logs and predictions
    db.query(DepartmentDB).delete()
    db.commit()


def seed_products(db, by_code, rng, now) -> None:
    for reference, name, category, material, standard, unit, color, qty_range, specs, steps in PRODUCTS:
        product = ProductDB(
            reference=reference, name=name, category=category, material=material, standard=standard,
            unit=unit, color=color, description=f"{name} ({standard}, {material})",
        )
        product.specs = [ProductSpecDB(name=n, value=v, unit=u) for n, v, u in specs]
        db.add(product)
        db.flush()
        by_key = {}
        for sequence, (key, step_name, code, minutes, _, _) in enumerate(steps, start=1):
            step = ProductStepDB(
                product_id=product.id, process_id=by_code[code].id, name=step_name, sequence=sequence,
                standard_duration_minutes=minutes,
            )
            db.add(step)
            db.flush()
            by_key[key] = step
        for key, _, _, _, deps, _ in steps:
            by_key[key].depends_on = [by_key[d] for d in deps]
        db.flush()

        # Past production runs: steps follow the routing order, with realistic durations, losses and gaps
        for n in range(1, RUNS_PER_PRODUCT + 1):
            quantity = rng.randint(*qty_range)
            cursor = now - timedelta(days=132 - n * 15, hours=rng.randint(0, 6))
            run_start = cursor
            remaining = float(quantity)
            executed = []
            total_scrap = 0.0
            for key, step_name, code, minutes, _, scrap_max in steps:
                process = by_code[code]
                scrap = round(remaining * rng.uniform(0, scrap_max))
                duration = remaining * minutes * rng.uniform(0.85, 1.25) / max(process.quantity, 1)
                started = cursor + timedelta(minutes=rng.randint(5, 90))
                ended = started + timedelta(minutes=duration)
                executed.append(ProductionRunStepDB(
                    product_step_id=by_key[key].id, step_name=step_name, process_id=process.id,
                    instance=rng.randint(1, process.quantity), started_at=started, ended_at=ended,
                    quantity_in=remaining, quantity_out=remaining - scrap, quantity_scrap=scrap,
                    operator=rng.choice(OPERATORS) if process.type == "manual" else None,
                ))
                remaining -= scrap
                total_scrap += scrap
                cursor = ended
            db.add(ProductionRunDB(
                product_id=product.id, batch_number=f"B-{reference}-{n:03d}",
                customer_order=f"CMD-{now.year}-{rng.randint(100, 480):04d}",
                started_at=run_start, ended_at=cursor + timedelta(minutes=10), quantity_produced=remaining,
                quantity_scrap=total_scrap, steps=executed,
                notes="High rejection rate on the weld inspection, seam parameters reviewed."
                if total_scrap > 0.05 * quantity else None,
            ))

def main() -> None:
    db = SessionLocal()
    try:
        if "--reset" in sys.argv:
            reset(db)
        if db.query(ProcessDB).first():
            print("Processes already present, nothing to do (use --reset to start over).")
            return
        rng = random.Random(42)
        now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        start = now - timedelta(hours=HISTORY_HOURS)
        slots = HISTORY_HOURS * 60 // SLOT_MINUTES + 1

        departments = {d.name: d for d in db.query(DepartmentDB).all()}
        for name, description in DEPARTMENTS.items():
            if name not in departments:
                departments[name] = DepartmentDB(name=name, description=description)
                db.add(departments[name])
        db.flush()

        by_code = {}
        for code, name, ptype, dept, capacity, quantity, utilization, description, sensors in PROCESSES:
            process = ProcessDB(
                code=code, name=name, type=ptype, capacity=capacity, quantity=quantity, status="active",
                department_id=departments[dept].id, description=description,
                scheduled_hours_30d=round(352 * (0.75 if dept in ("Forge", "Noir") else 1.0)),
                last_update=now if sensors else None,
            )
            for sname, dtype, sdescription, *_ in sensors:
                process.sensors.append(ProcessSensorDB(name=sname, data_type=dtype, description=sdescription))
            db.add(process)
            db.flush()
            db.add_all(sensor_readings(rng, process, sensors, start, busy_series(rng, start, slots, utilization)))
            by_code[code] = process

        for code, days, ltype, desc, status, downtime, tech in LOGS:
            db.add(MaintenanceLogDB(
                process_id=by_code[code].id, performed_at=now - timedelta(days=days, hours=rng.randint(0, 8)),
                type=ltype, description=desc, status=status, downtime_hours=downtime, technician=tech,
            ))
        seed_products(db, by_code, rng, now)
        db.commit()
        print(f"Seeded {len(departments)} departments, {len(by_code)} processes, products, runs, readings and maintenance logs.")
    finally:
        db.close()

if __name__ == "__main__":
    main()
