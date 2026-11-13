export class AutomationError extends Error {
  constructor(code, message, options = {}) { super(message); this.name = "AutomationError"; this.code = code; this.retryable = Boolean(options.retryable); this.uncertain = Boolean(options.uncertain); this.status = options.status || 400; }
}
export const setupError = () => new AutomationError("setup_required", "Server automation is not configured yet.", { status: 503 });
export function publicError(error) {
  return error instanceof AutomationError ? { code: error.code, error: error.message } : { code: "server_error", error: "The request could not be completed. Your secrets have not been returned. Please try again or check server configuration." };
}
