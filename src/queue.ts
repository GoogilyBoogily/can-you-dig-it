import { K, type Options } from "./model";

/** Clearance between stored cans and stops, in mm. Horizontal spacing is deliberately
 * conservative: adjacent cylinder centres are at least one diameter apart at any slope. */
export const CAN_CLEARANCE = 0.5;

export function chuteInset(options: Options): number {
  return options.cascade ? options.canD + 6 + options.wall : 0;
}

function queueFrontAllowance(options: Options, bottom: boolean): number {
  return !options.cascade || bottom ? K.lipInset + K.lipTabT / 2 + CAN_CLEARANCE : CAN_CLEARANCE;
}

/** One definition for solver capacity, minimum lane length and preview placement.
 * Cylinder centres are offset normal to the sloping deck, rather than vertically by
 * one radius (which embeds a cylinder in every non-flat deck). */
export function queueGeometry(options: Options, length: number, bottom = false) {
  const radius = options.canD / 2;
  const tangent = Math.tan(options.slope * Math.PI / 180);
  const deckStart = -length / 2 + (bottom ? 0 : chuteInset(options));
  const pitch = options.canD + CAN_CLEARANCE;
  const first = deckStart + queueFrontAllowance(options, bottom) + radius;
  const last = length / 2 - options.wall - K.post - radius - CAN_CLEARANCE;
  const count = Math.max(0, Math.floor((last - first + 1e-8) / pitch) + 1);
  return {
    count, pitch, first, last, deckStart,
    position(index: number): [number, number, number] {
      if (!Number.isInteger(index) || index < 0 || index >= count) throw new Error(`Can index ${index} is outside queue of ${count}`);
      const x = first + index * pitch;
      return [x, 0, K.deckLo + (x - deckStart) * tangent + radius * Math.hypot(1, tangent)];
    },
  };
}

export function minimumQueueLength(options: Options, cans: number, bottom = false): number {
  if (!Number.isInteger(cans) || cans < 1) throw new Error("A queue needs a positive integer number of cans");
  return (bottom ? 0 : chuteInset(options)) + queueFrontAllowance(options, bottom)
    + cans * options.canD + (cans - 1) * CAN_CLEARANCE + CAN_CLEARANCE + options.wall + K.post;
}
