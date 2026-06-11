export class WizgitError extends Error {
  readonly hint?: string;

  constructor(message: string, options?: { hint?: string }) {
    super(message);
    this.name = 'WizgitError';
    this.hint = options?.hint;
  }
}
