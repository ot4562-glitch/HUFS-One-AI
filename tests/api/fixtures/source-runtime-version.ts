export function syntheticSourceRuntimeVersion(){
  const expected={gitSha:'a'.repeat(40),buildSha:'b'.repeat(64),migrationVersion:'SYN-MIGRATION',
    adapterVersion:'SYN-ADAPTER',datasetRevision:'SYN-DATASET',schemaVersion:1};
  return {expected,reader:{minSchemaVersion:1,maxSchemaVersion:1},loadCurrent:async()=>({...expected})};
}
