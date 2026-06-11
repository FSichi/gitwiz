export class GitwizError extends Error {
  readonly hint?: string;

  constructor(message: string, options?: { hint?: string }) {
    super(message);
    this.name = 'GitwizError';
    this.hint = options?.hint;
  }
}
