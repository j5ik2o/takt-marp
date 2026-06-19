export class SlideWorkflowError extends Error {
  constructor(message, code = "SLIDE_WORKFLOW_ERROR") {
    super(message);
    this.name = "SlideWorkflowError";
    this.code = code;
  }
}

export function formatError(error) {
  return error instanceof SlideWorkflowError ? `${error.code}: ${error.message}` : String(error?.stack ?? error);
}
