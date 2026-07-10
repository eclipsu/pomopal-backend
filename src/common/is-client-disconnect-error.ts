export function isClientDisconnectError(exception: unknown): boolean {
  if (!exception || typeof exception !== 'object') return false;

  const err = exception as Error & { code?: string };
  const message = err.message?.toLowerCase() ?? '';

  return (
    message === 'request aborted' ||
    message === 'aborted' ||
    err.code === 'ECONNABORTED' ||
    err.code === 'ECONNRESET' ||
    err.code === 'ERR_STREAM_PREMATURE_CLOSE'
  );
}
