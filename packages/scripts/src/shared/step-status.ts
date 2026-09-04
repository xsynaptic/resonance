// Warn-only deploy steps report one of these so `deploy-site` can summarize them in one block
export type StepStatus = 'ok' | 'skipped' | 'warned';
