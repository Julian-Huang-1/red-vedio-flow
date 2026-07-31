import { join } from 'node:path'
import {
  createPostgresDatabase,
  migratePostgres,
} from '@red-video-flow/postgres-backend'
import { readCoworkDatabase } from './config.js'

const database = createPostgresDatabase(
  readCoworkDatabase(join(process.cwd(), 'db.properties')),
)

try {
  await migratePostgres(database)
  console.log('[init-db] PostgreSQL schema is ready')
} finally {
  await database.end({ timeout: 5 })
}
