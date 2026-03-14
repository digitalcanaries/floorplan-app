// Unit conversion utilities
// All internal storage is in feet. This module converts at the UI boundary.

export const UNITS = {
  ft:  { label: 'ft',  factor: 1,     step: 0.5, precision: 1 },
  in:  { label: 'in',  factor: 12,    step: 1,   precision: 0 },
  cm:  { label: 'cm',  factor: 30.48, step: 1,   precision: 0 },
  mm:  { label: 'mm',  factor: 304.8, step: 10,  precision: 0 },
}

export const UNIT_OPTIONS = Object.keys(UNITS)

/** Convert a value FROM the given unit TO feet (for storage) */
export function toFeet(value, fromUnit) {
  const u = UNITS[fromUnit]
  if (!u || !isFinite(value)) return value
  return value / u.factor
}

/** Convert a value FROM feet TO the given unit (for display) */
export function fromFeet(valueFt, toUnit) {
  const u = UNITS[toUnit]
  if (!u || !isFinite(valueFt)) return valueFt
  return valueFt * u.factor
}

/** Format a feet value for display in the given unit (rounded to appropriate precision) */
export function formatInUnit(valueFt, toUnit) {
  const converted = fromFeet(valueFt, toUnit)
  const p = UNITS[toUnit]?.precision ?? 1
  return Number(converted.toFixed(p))
}
