import {describe,expect,it,vi} from 'vitest';
import {readExperiencePortfolio} from '../../apps/api/src/modules/profiles/experience-portfolio.js';
import {ExperiencePortfolioSchema} from '@hufs-one/contracts';

const now='2026-11-05T00:00:00.000Z';
const consent={version:2,updatedAt:now,choices:{personalStorage:true,teamReview:true,externalAi:true,ncpStorage:true,presentation:true}};
const record={itemId:'EXP-ONE',version:3,updatedAt:now,value:{kind:'EXPERIENCE' as const,
  state:'SELF_REPORTED' as const,dataMode:'OWNER_CONSENTED' as const,title:'My project',summary:'I prepared a chart.'}};
const approved={state:'ACTIVE' as const,version:1,contentVersion:3,consentVersion:2,
  topics:['DATA_ANALYTICS'],approvedAt:now,provenance:'LOCAL_USER_SELECTION' as const};
function fixture(){
  const readConsents=vi.fn(async()=>structuredClone(consent));
  const read=vi.fn(async()=>structuredClone(record));
  const readApproval=vi.fn(async()=>structuredClone(approved));
  const input={actorId:'OWNER-A',page:{items:[structuredClone(record)],nextCursor:null},
    accounts:{readConsents},workspace:{read},approvals:{read:readApproval},now:()=>now};
  return {input,readConsents,read,readApproval};
}

describe('owner experience portfolio is explicit owner selection, never skill certification',()=>{
  it('includes only current approved topics bound to owner, content and consent versions',async()=>{
    const h=fixture(),result=await readExperiencePortfolio(h.input as any);
    expect(result.items[0]?.itemId).toBe(record.itemId);
    expect(result.portfolio.consentVersion).toBe(2);
    expect(result.portfolio).toMatchObject({coverage:'PAGE',complete:true});
    expect(result.portfolio.topics).toEqual([{topicCode:'DATA_ANALYTICS',experienceIds:['EXP-ONE']}]);
    expect(result.portfolio.evidence[0]?.approval.state).toBe('ACTIVE');
    expect(h.readConsents).toHaveBeenCalledWith('OWNER-A');
    expect(h.read).toHaveBeenCalledWith({actorId:'OWNER-A',kind:'EXPERIENCE',itemId:'EXP-ONE'});
    expect(h.readApproval).toHaveBeenCalledWith({actorId:'OWNER-A',experienceId:'EXP-ONE'});
  });
  it('explicitly flags partial-page coverage and rejects a forged complete claim',async()=>{
    const h=fixture(),result=await readExperiencePortfolio({...h.input,
      page:{items:[structuredClone(record)],nextCursor:'EXP-ONE'}} as any);
    expect(result.portfolio).toMatchObject({coverage:'PAGE',complete:false});
    expect(ExperiencePortfolioSchema.safeParse({...result,
      portfolio:{...result.portfolio,complete:true}}).success).toBe(false);
  });
  it('shows synthetic evidence without converting it into a real owner recommendation topic',async()=>{
    const h=fixture(),synthetic={...record,value:{...record.value,dataMode:'SYNTHETIC' as const}};
    h.read.mockResolvedValue(synthetic as any);
    const result=await readExperiencePortfolio({...h.input,
      page:{items:[synthetic],nextCursor:null}} as any);
    expect(result.portfolio.evidence[0]?.approval.state).toBe('ACTIVE');
    expect(result.portfolio.topics).toEqual([]);
    expect(result.items[0]?.value.dataMode).toBe('SYNTHETIC');
  });
  it('keeps an unapproved experience but does not fabricate topic or proficiency',async()=>{
    const h=fixture();h.readApproval.mockResolvedValue({state:'INACTIVE',version:0,reason:'NOT_APPROVED'} as any);
    const result=await readExperiencePortfolio(h.input as any);
    expect(result.portfolio.topics).toEqual([]);
    expect(result.portfolio.evidence[0]?.approval.state).toBe('INACTIVE');
    expect(JSON.stringify(result)).not.toContain('proficiency');
  });
  it('refuses absent personal storage and never discovers content under another actor',async()=>{
    const h=fixture();h.readConsents.mockResolvedValue({...consent,choices:{...consent.choices,personalStorage:false}});
    await expect(readExperiencePortfolio(h.input as any)).rejects.toThrow('FORBIDDEN');
    expect(h.read).not.toHaveBeenCalled();expect(h.readApproval).not.toHaveBeenCalled();
  });
  it('rejects consent, content or approval races instead of returning stale skills',async()=>{
    const a=fixture();a.readConsents.mockResolvedValueOnce(consent).mockResolvedValue({...consent,version:3});
    await expect(readExperiencePortfolio(a.input as any)).rejects.toThrow('VERSION_CONFLICT');
    const b=fixture();b.read.mockResolvedValueOnce(record).mockResolvedValue({...record,version:4});
    await expect(readExperiencePortfolio(b.input as any)).rejects.toThrow('VERSION_CONFLICT');
    const c=fixture();c.readApproval.mockResolvedValueOnce(approved).mockResolvedValue({state:'INACTIVE',version:2,reason:'REVOKED'} as any);
    await expect(readExperiencePortfolio(c.input as any)).rejects.toThrow('VERSION_CONFLICT');
  });
  it('does not accept mismatched approval versions or more than twenty experiences',async()=>{
    const a=fixture();a.readApproval.mockResolvedValue({...approved,contentVersion:9});
    await expect(readExperiencePortfolio(a.input as any)).rejects.toThrow('VERSION_CONFLICT');
    const b=fixture();b.input.page.items=Array.from({length:21},(_,i)=>({...record,itemId:'EXP-'+i}));
    await expect(readExperiencePortfolio(b.input as any)).rejects.toThrow();
    expect(b.readConsents).not.toHaveBeenCalled();
  });
  it('refuses future approval timestamps and a forged returned item identity',async()=>{
    const a=fixture();a.readApproval.mockResolvedValue({...approved,approvedAt:'2026-11-06T00:00:00.000Z'});
    await expect(readExperiencePortfolio(a.input as any)).rejects.toThrow();
    const b=fixture();b.read.mockResolvedValue({...record,itemId:'FOREIGN-ID'});
    await expect(readExperiencePortfolio(b.input as any)).rejects.toThrow();
  });
});
