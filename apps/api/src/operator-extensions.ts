import type {DataPoolSettings,ManagedDataPool} from './db/pg-pool.js';
import type {PostgresPlatformConfig} from './platform-postgres.js';

/** Every existing pool-bearing platform service can be configured without
 * bypassing the role/TLS/startup/shutdown checks in the operator launcher. */
export const MANAGED_PLATFORM_EXTENSIONS=[
  'sourceIngestion','restrictedIntake','selfAccount','ownerWorkspace','experienceApproval',
  'demoOverlay','sourceReview','ownerCatalog','ownerRecommendations','studyPlanCheck',
  'ownerStudyPlan','doubleMajor','revisionComparison',
] as const;
export type ManagedPlatformExtension=typeof MANAGED_PLATFORM_EXTENSIONS[number];
export type OperatorExtensions={
  [K in ManagedPlatformExtension]?:Omit<NonNullable<PostgresPlatformConfig[K]>,'pool'>&{settings:DataPoolSettings};
};
export type ManagedExtensionPools=Partial<Record<ManagedPlatformExtension,ManagedDataPool>>;

const required:Record<ManagedPlatformExtension,readonly string[]>={
  sourceIngestion:['authority','executor'],restrictedIntake:['authority'],
  selfAccount:['authority'],ownerWorkspace:['authority'],experienceApproval:['authority'],
  demoOverlay:[],sourceReview:['authority'],ownerCatalog:['authority'],
  ownerRecommendations:['authority','ownerAuthority','approval'],
  studyPlanCheck:['authority','rights','approvalGate'],
  ownerStudyPlan:['authority','ownerAuthority','approval'],doubleMajor:['authority'],revisionComparison:['authority'],
};
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const own=(value:object,key:string)=>Object.prototype.hasOwnProperty.call(value,key);

/** Validate before constructing pools. Credentials never appear in diagnostics. */
export function extensionSettings(input:OperatorExtensions|undefined):Partial<Record<ManagedPlatformExtension,DataPoolSettings>>{
  if(input===undefined)return {};
  if(!object(input))throw new Error('Operator extensions must be a configuration object');
  const entries:Array<[ManagedPlatformExtension,DataPoolSettings]>=[];
  for(const [key,raw] of Object.entries(input as Record<string,unknown>)){
    if(!MANAGED_PLATFORM_EXTENSIONS.includes(key as ManagedPlatformExtension)||!object(raw))
      throw new Error('Unknown or invalid operator extension');
    const name=key as ManagedPlatformExtension,keys=required[name];
    if(!object(raw.settings)||Object.keys(raw).some(field=>field!=='settings'&&!keys.includes(field))
      ||keys.some(field=>raw[field]===undefined||raw[field]===null))
      throw new Error('Operator extension requires settings and configured ports; raw pools are forbidden');
    if((name==='experienceApproval'||name==='ownerWorkspace')
      &&(!object(raw.authority)||typeof raw.authority.mayOperate!=='function'))
      throw new Error('Owner extension requires a current operation authority');
    entries.push([name,raw.settings as unknown as DataPoolSettings]);
  }
  if(input.studyPlanCheck&&input.ownerStudyPlan)
    throw new Error('Select one managed owner study-plan extension');
  return Object.fromEntries(entries);
}

/** A raw pool is never copied from the caller. Configuration objects are copied
 * so replacing their settings/pool after preparation cannot redirect SQL. */
export function bindManagedExtensions(input:OperatorExtensions|undefined,pools:ManagedExtensionPools):
  Pick<PostgresPlatformConfig,ManagedPlatformExtension>{
  extensionSettings(input);
  const entries=MANAGED_PLATFORM_EXTENSIONS.flatMap(name=>{
    const spec=input?.[name];
    if(!spec)return [];
    const pool=pools[name];
    if(!pool)throw new Error('Missing managed extension pool');
    const {settings:_settings,...ports}=spec;
    return [[name,{...ports,pool}]];
  });
  return Object.fromEntries(entries) as Pick<PostgresPlatformConfig,ManagedPlatformExtension>;
}

/** Revalidate prepared objects before any SQL connection. A caller must not
 * smuggle a raw pool into a supported service or a loader-only service. */
export function assertManagedExtensions(platform:PostgresPlatformConfig,pools:ManagedExtensionPools):ManagedPlatformExtension[]{
  if(own(platform,'majorWhatIf'))
    throw new Error('Operator platform SQL pools must use verified role settings');
  const active:ManagedPlatformExtension[]=[];
  for(const name of MANAGED_PLATFORM_EXTENSIONS){
    if(!own(platform,name))continue;
    const config=platform[name];
    if(!config||!pools[name]||config.pool!==pools[name]
      ||required[name].some(field=>!(field in config)||(config as unknown as Record<string,unknown>)[field]==null))
      throw new Error('Operator platform SQL pools must use verified role settings');
    active.push(name);
  }
  return active;
}
