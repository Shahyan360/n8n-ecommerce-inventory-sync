import 'dotenv/config';
import path from 'node:path';
export const nativeEnv={...process.env,
  N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS:'false',N8N_USER_FOLDER:path.resolve('.runtime/n8n-user'),
  DB_TYPE:'postgresdb',DB_POSTGRESDB_HOST:'127.0.0.1',DB_POSTGRESDB_PORT:'55432',DB_POSTGRESDB_DATABASE:'n8n',DB_POSTGRESDB_USER:'n8n_app',DB_POSTGRESDB_PASSWORD:process.env.N8N_DB_PASSWORD,
  N8N_DIAGNOSTICS_ENABLED:'false',N8N_VERSION_NOTIFICATIONS_ENABLED:'false',N8N_PERSONALIZATION_ENABLED:'false',N8N_BLOCK_ENV_ACCESS_IN_NODE:'false',
  N8N_SECURE_COOKIE:'false',N8N_RUNNERS_MODE:'internal',N8N_LISTEN_ADDRESS:'127.0.0.1',N8N_RUNNERS_TASK_TIMEOUT:'60',N8N_UNVERIFIED_PACKAGES_ENABLED:'false',
  N8N_DISABLED_MODULES:'chat-hub,agents,agent-evals,workflow-builder,instance-ai,quick-connect,mcp,mcp-discovery,mcp-registry',
  NODES_INCLUDE:JSON.stringify(['webhook','httpRequest','executeWorkflow','executeWorkflowTrigger','set','scheduleTrigger','errorTrigger','manualTrigger','code'].map(n=>`n8n-nodes-base.${n}`)),
  EXECUTIONS_MODE:'regular',EXECUTIONS_DATA_PRUNE:'true',EXECUTIONS_DATA_MAX_AGE:'168',GENERIC_TIMEZONE:'Asia/Karachi',N8N_PORT:'5678'
};
