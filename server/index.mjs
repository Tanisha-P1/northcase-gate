import { resolve } from 'node:path'
import { createDatabase } from './database.mjs'
import { createApiServer } from './app.mjs'
import { runDueScheduledReminders } from './workflow.mjs'

const port = Number(process.env.PORT ?? 3001)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a whole number between 1 and 65535.')
}

const overdueDays = Number(process.env.NG_OVERDUE_DAYS ?? 7)
if (!Number.isInteger(overdueDays) || overdueDays < 1 || overdueDays > 90) {
  throw new Error('NG_OVERDUE_DAYS must be a whole number between 1 and 90.')
}

const configuredDatabasePath = process.env.NG_DATABASE_PATH ?? './northgate.sqlite'
const databasePath = configuredDatabasePath === ':memory:'
  ? configuredDatabasePath
  : resolve(configuredDatabasePath)
const db = createDatabase(databasePath)
const server = createApiServer({ db, overdueDays })
const scheduler = setInterval(() => {
  try {
    const sentCount = runDueScheduledReminders(db)
    if (sentCount > 0) console.info(`Simulated ${sentCount} approved scheduled reminder(s).`)
  } catch (error) {
    console.error('Scheduled reminder simulation failed:', error)
  }
}, 15_000)

server.listen(port, '127.0.0.1', () => {
  console.info(`Northgate Chase API listening on http://127.0.0.1:${port}`)
  console.info(`SQLite database: ${databasePath}`)
  console.info('Synthetic data only. No real emails are sent.')
})

function shutdown() {
  clearInterval(scheduler)
  server.close(() => {
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
