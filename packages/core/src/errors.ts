/**
 * Thrown at the model boundary when an input violates the contracts in
 * types.ts. The message names the offending field, the value received, and
 * how to fix it — the studio renders these directly to users.
 */
export class InputValidationError extends Error {
  /** Dotted path of the offending field, e.g. "pulses[2].depthFraction". */
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "InputValidationError";
    this.field = field;
  }
}
