import type {TopicCode} from '@hufs-one/contracts';

/**
 * A04.1 TopicCode display names. Mirrors packages/core TOPIC_LABELS_KO (drift test in
 * topicText.test.ts) so the browser bundle does not import the recommendation core.
 */
export const TOPIC_TEXT: Readonly<Record<TopicCode, string>> = {
  TRADE_OVERSEAS: '무역·통상', GLOBAL_SALES: '해외영업', LANGUAGE_TRANSLATION: '통번역·언어서비스', INTL_ORGANIZATION: '국제기구',
  INTL_COOPERATION: '국제개발·협력', DIPLOMACY_PUBLIC: '외교·공공외교', FINANCE_INVESTMENT: '금융·투자', ACCOUNTING_TAX: '회계·세무',
  ECONOMIC_RESEARCH: '경제연구', DATA_ANALYTICS: '데이터 분석', AI_ML: 'AI·머신러닝', SOFTWARE_DEV: '소프트웨어 개발',
  CYBERSECURITY: '정보보안', CLOUD_INFRA: '클라우드·인프라', PRODUCT_UX: '프로덕트·UX', MARKETING_BRAND: '마케팅·브랜딩',
  MEDIA_CONTENT: '미디어·콘텐츠', EDUCATION_TUTORING: '교육·교수학습', HR_ORG: '인사·조직', CONSULTING_STRATEGY: '컨설팅·전략',
  STARTUP_ENTREPRENEUR: '창업', PUBLIC_POLICY: '공공정책', ESG_SUSTAINABILITY: 'ESG·지속가능성', CULTURE_TOURISM: '문화·관광',
};
