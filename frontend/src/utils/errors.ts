export const getApiErrorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

export const hasFormValidationError = (error: unknown) =>
  Boolean((error as { errorFields?: unknown[] })?.errorFields);
