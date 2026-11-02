import {getHufsAbilityManifest} from '@hufs-one/contracts';
const manifest=getHufsAbilityManifest();
export function HufsAbilityMenu() {
  return <section aria-labelledby="local-hufsability-title" className="local-account__panel">
    <h2 id="local-hufsability-title">HUFSAbility 기존 메뉴</h2>
    <p>독립 합성 데모입니다. 기존 학생 메뉴 5분류·24개는 모두 🚫 미지원입니다. 학교 서비스의 인증·상담·성적·신청 기능을 제공하지 않습니다.</p>
    <p>공개 메뉴 소개 관찰일 {manifest.source.observedOn} · <a href={manifest.source.url} target="_blank" rel="noreferrer">메뉴 소개 출처 (외부)</a></p>
    <div className="local-account__grid">{manifest.categories.map(category=><div key={category.id}><h3>{category.label}</h3>
      <ul>{category.items.map(item=><li key={item.id}><button type="button" disabled>{item.label} · {item.disabledText}</button></li>)}</ul></div>)}</div>
    <h3>공개 진입 4영역</h3><p>아래 링크는 모두 학교 공식 HUFSAbility 첫 화면으로 연결합니다. 개별 서비스 연결·접근권은 검증하지 않았습니다.</p>
    <ul>{manifest.publicEntries.map(item=><li key={item.id}><a href={item.officialUrl!} target="_blank" rel="noreferrer">{item.label} · 공식 홈페이지로 이동 (외부)</a> · {item.disabledText}</li>)}</ul>
  </section>;
}
