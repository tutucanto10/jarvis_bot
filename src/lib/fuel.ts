export interface FuelPoint {
  liters: number | null;
  odometerKm: number | null;
}

/**
 * km/l per fill-up, assuming full tanks: the liters put in at a fill-up
 * cover the distance driven since the previous fill-up with an odometer reading.
 * Fill-ups in between without an odometer add their liters to the next one.
 * Input oldest → newest; output aligned with input (null when it can't be computed).
 */
export function kmPerLiter(points: FuelPoint[]): (number | null)[] {
  let lastOdometer: number | null = null;
  let litersSince = 0;
  let litersKnown = true;

  return points.map((p) => {
    litersSince += p.liters ?? 0;
    litersKnown &&= p.liters != null;

    if (p.odometerKm == null) return null;

    const distance = lastOdometer == null ? null : p.odometerKm - lastOdometer;
    const result =
      distance != null && distance > 0 && litersKnown && litersSince > 0 ? distance / litersSince : null;

    lastOdometer = p.odometerKm;
    litersSince = 0;
    litersKnown = true;
    return result;
  });
}

/** Total km / total liters across all computable stretches. */
export function averageKmPerLiter(points: FuelPoint[]): number | null {
  const values = kmPerLiter(points);
  let km = 0;
  let liters = 0;
  let lastOdometer: number | null = null;
  let litersSince = 0;

  points.forEach((p, i) => {
    litersSince += p.liters ?? 0;
    if (p.odometerKm == null) return;
    if (values[i] != null && lastOdometer != null) {
      km += p.odometerKm - lastOdometer;
      liters += litersSince;
    }
    lastOdometer = p.odometerKm;
    litersSince = 0;
  });

  return liters > 0 ? km / liters : null;
}
