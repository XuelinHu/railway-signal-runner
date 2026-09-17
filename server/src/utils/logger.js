function line(level, message, meta) {
  const entry = { time: new Date().toISOString(), level, message }
  if (meta && Object.keys(meta).length > 0) entry.meta = meta
  const text = JSON.stringify(entry)
  if (level === 'error') console.error(text)
  else if (level === 'warn') console.warn(text)
  else console.log(text)
}

export const logger = {
  info: (message, meta) => line('info', message, meta),
  warn: (message, meta) => line('warn', message, meta),
  error: (message, meta) => line('error', message, meta),
}
