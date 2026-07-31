import postgres, { type Sql } from 'postgres'

export type PostgresDatabase = Sql<Record<string, never>>

export function createPostgresDatabase(databaseUrl: string) {
  return postgres(databaseUrl, {
    max: Number(process.env.RED_VIDEO_FLOW_DB_POOL_SIZE ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  })
}

export async function migratePostgres(sql: PostgresDatabase) {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(78234612001)`
    await tx`
      CREATE TABLE IF NOT EXISTS app_users (
        id uuid PRIMARY KEY,
        sso_id text NOT NULL UNIQUE,
        username text NOT NULL,
        email text NOT NULL,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL
      )
    `
    await tx`
      CREATE TABLE IF NOT EXISTS user_model_credentials (
        user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
        encrypted_token text NOT NULL,
        encryption_iv text NOT NULL,
        encryption_auth_tag text NOT NULL,
        encryption_key_version integer NOT NULL DEFAULT 1,
        token_fingerprint text NOT NULL,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL
      )
    `
    await tx`
      CREATE TABLE IF NOT EXISTS jobs (
        id text PRIMARY KEY,
        type text NOT NULL,
        payload jsonb NOT NULL,
        status text NOT NULL,
        priority integer NOT NULL DEFAULT 0,
        attempts integer NOT NULL DEFAULT 0,
        max_attempts integer NOT NULL DEFAULT 3,
        run_at bigint NOT NULL,
        locked_by text,
        locked_at bigint,
        lease_expires_at bigint,
        last_error text,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL
      )
    `
    await tx`
      CREATE INDEX IF NOT EXISTS idx_jobs_claim
      ON jobs(status, priority DESC, run_at, created_at)
    `
    await tx`
      CREATE INDEX IF NOT EXISTS idx_jobs_lease
      ON jobs(status, lease_expires_at)
    `
    await tx`
      CREATE TABLE IF NOT EXISTS stored_blobs (
        id uuid PRIMARY KEY,
        owner_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        lo_oid oid NOT NULL,
        file_name text NOT NULL,
        content_type text,
        size bigint NOT NULL,
        sha256 text NOT NULL,
        created_at bigint NOT NULL
      )
    `
    await tx`
      CREATE TABLE IF NOT EXISTS workflows (
        id text PRIMARY KEY,
        title text NOT NULL,
        schema_version integer NOT NULL,
        revision bigint NOT NULL,
        graph jsonb NOT NULL,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL
      )
    `
    await tx`
      CREATE TABLE IF NOT EXISTS runs (
        id text PRIMARY KEY,
        user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
        workflow_id text NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        node_id text NOT NULL,
        status text NOT NULL,
        prompt text NOT NULL,
        kind text NOT NULL,
        input jsonb,
        provider_id text,
        provider_task_id text,
        provider_response_id text,
        result_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        result jsonb,
        trace jsonb,
        error text,
        error_code text,
        error_retryable boolean,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL,
        started_at bigint NOT NULL,
        heartbeat_at bigint NOT NULL,
        finished_at bigint
      )
    `
    await tx`
      CREATE INDEX IF NOT EXISTS idx_runs_workflow_updated
      ON runs(workflow_id, updated_at DESC)
    `
    await tx`
      CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status)
    `
    await tx`
      CREATE TABLE IF NOT EXISTS node_run_events (
        id bigserial PRIMARY KEY,
        run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        type text NOT NULL,
        data jsonb NOT NULL,
        created_at bigint NOT NULL
      )
    `
    await tx`
      CREATE INDEX IF NOT EXISTS idx_node_run_events_run
      ON node_run_events(run_id, id)
    `
    await tx`
      CREATE TABLE IF NOT EXISTS workflow_app_runs (
        id text PRIMARY KEY,
        workflow_id text NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        revision bigint NOT NULL,
        status text NOT NULL,
        data jsonb NOT NULL,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL
      )
    `
    await tx`
      CREATE INDEX IF NOT EXISTS idx_workflow_app_runs_workflow
      ON workflow_app_runs(workflow_id, updated_at DESC)
    `
    await tx`
      CREATE TABLE IF NOT EXISTS resources (
        id uuid PRIMARY KEY,
        workspace_id text NOT NULL,
        kind text NOT NULL,
        name text NOT NULL,
        mime_type text,
        text_content text,
        blob_id uuid REFERENCES stored_blobs(id) ON DELETE SET NULL,
        url text,
        file_name text,
        metadata jsonb,
        source text NOT NULL,
        source_node_id text,
        source_run_id text,
        source_result_id text,
        provider_id text,
        model_id text,
        prompt text,
        generation_config jsonb,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL,
        deleted_at bigint
      )
    `
    await tx`
      CREATE INDEX IF NOT EXISTS idx_resources_workspace
      ON resources(workspace_id, updated_at DESC)
    `
    await tx`
      CREATE TABLE IF NOT EXISTS resource_bindings (
        id uuid PRIMARY KEY,
        resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        workflow_id text NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        node_id text,
        run_id text,
        result_id text,
        relation text NOT NULL,
        created_at bigint NOT NULL
      )
    `
    await tx`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_resource_bindings_identity
      ON resource_bindings (
        resource_id,
        workflow_id,
        COALESCE(node_id, ''),
        COALESCE(run_id, ''),
        COALESCE(result_id, ''),
        relation
      )
    `
    await tx`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id text PRIMARY KEY,
        owner_id uuid REFERENCES app_users(id) ON DELETE CASCADE,
        title text NOT NULL,
        workflow_id text REFERENCES workflows(id) ON DELETE SET NULL,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL
      )
    `
    await tx`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id text PRIMARY KEY,
        session_id text NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        kind text NOT NULL,
        role text NOT NULL,
        text text NOT NULL,
        status text NOT NULL,
        agent_id text,
        agent_label text,
        model_id text,
        error text,
        run jsonb,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL
      )
    `
    await tx`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session
      ON chat_messages(session_id, created_at)
    `
  })
}
