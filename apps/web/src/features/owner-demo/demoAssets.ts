import type {TopicCode} from '@hufs-one/contracts';
const covers=[
 new URL('./assets/asset-01-technology.svg',import.meta.url).href,
 new URL('./assets/asset-02-business.svg',import.meta.url).href,
 new URL('./assets/asset-03-global.svg',import.meta.url).href,
 new URL('./assets/asset-04-culture.svg',import.meta.url).href,
 new URL('./assets/asset-05-policy.svg',import.meta.url).href,
 new URL('./assets/asset-06-environment.svg',import.meta.url).href,
 new URL('./assets/asset-07-education.svg',import.meta.url).href,
 new URL('./assets/asset-08-innovation.svg',import.meta.url).href,
] as const;
export const EMPTY_DEMO_ASSET=new URL('./assets/asset-09-empty.svg',import.meta.url).href;
export const EMPTY_DEMO_INITIALS=new URL('./assets/asset-10-initials.svg',import.meta.url).href;
export function demoTopicCover(topics:readonly TopicCode[]):string {
 const topic=topics[0]??'';
 if(/FINANCE|ECONOMIC|ACCOUNTING|CONSULTING|HR_ORG|MARKETING/.test(topic))return covers[1];
 if(/LANGUAGE|GLOBAL|TRADE|INTL/.test(topic))return covers[2];
 if(/CULTURE|MEDIA/.test(topic))return covers[3];
 if(/PUBLIC|DIPLOMACY/.test(topic))return covers[4];
 if(/ESG/.test(topic))return covers[5];
 if(/EDUCATION/.test(topic))return covers[6];
 if(/STARTUP|PRODUCT/.test(topic))return covers[7];
 return covers[0];
}
