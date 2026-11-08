// @vitest-environment jsdom
import {afterEach,describe,expect,it} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {InAppLink} from './AppShell.js';
import {STATIC_PAGES_PREVIEW,activeTab,inAppHref,useRoute,validPath,
  type HistoryPort} from './router.js';

function browser(initial='/'){
  let pathname=initial;
  const pushes:string[]=[];
  const listeners=new Set<()=>void>();
  const port={
    location:{get pathname(){return pathname;}},
    history:{pushState(_data:unknown,_unused:string,url:string){
      pathname=url;pushes.push(url);
    }},
    addEventListener(_event:'popstate',listener:()=>void){listeners.add(listener);},
    removeEventListener(_event:'popstate',listener:()=>void){listeners.delete(listener);},
  } as unknown as HistoryPort;
  return {port,pushes,pop(next:string){pathname=next;for(const listener of listeners)listener();}};
}
function RouteView({port}:{port:HistoryPort}){
  const [path,navigate]=useRoute(port);
  return <section>
    <output data-testid="route">{path}</output>
    <InAppLink to="/opportunities/opp%3A2026" navigate={navigate}>Encoded opportunity</InAppLink>
    <InAppLink to="/notices/item.1" navigate={navigate}>Dotted notice</InAppLink>
    <InAppLink to="/opportunities/../escape" navigate={navigate}>Unsafe target</InAppLink>
  </section>;
}
afterEach(cleanup);

describe('#369 encoded-detail browser navigation regression',()=>{
  it('navigates a canonical encoded opportunity via ordinary click and restores it on back',()=>{
    const h=browser();render(<RouteView port={h.port}/>);
    const link=screen.getByRole('link',{name:'Encoded opportunity'});
    expect(link.getAttribute('href')).toBe(inAppHref('/opportunities/opp%3A2026'));
    fireEvent.click(link);
    expect(screen.getByTestId('route').textContent).toBe('/opportunities/opp%3A2026');
    expect(activeTab('/opportunities/opp%3A2026')).toBe('/opportunities');
    expect(h.pushes).toEqual(['/opportunities/opp%3A2026']);
    act(()=>h.pop('/'));
    expect(screen.getByTestId('route').textContent).toBe('/');
    act(()=>h.pop('/opportunities/opp%3A2026'));
    expect(screen.getByTestId('route').textContent).toBe('/opportunities/opp%3A2026');
  });
  it('preserves canonical notice href for opening in a new tab and normal click',()=>{
    const h=browser();render(<RouteView port={h.port}/>);
    const link=screen.getByRole('link',{name:'Dotted notice'});
    expect(link.getAttribute('href')).toBe(inAppHref('/notices/item.1'));
    fireEvent.click(link);
    expect(screen.getByTestId('route').textContent).toBe('/notices/item.1');
    expect(activeTab('/notices/item.1')).toBe('/');
  });
  it('rejects traversal and does not change browser history, even when clicked',()=>{
    const h=browser('/opportunities');
    render(<RouteView port={h.port}/>);
    expect(validPath('/opportunities/../escape')).toBe(false);
    fireEvent.click(screen.getByRole('link',{name:'Unsafe target'}));
    expect(screen.getByTestId('route').textContent).toBe('/opportunities');
    expect(h.pushes).toEqual([]);
  });
  it('generates the Pages preview query href only for an actual preview build',()=>{
    const path='/opportunities/opp%3A2026';
    expect(inAppHref(path)).toBe(STATIC_PAGES_PREVIEW
      ? `${import.meta.env.BASE_URL}?page=${encodeURIComponent(path)}` : path);
    expect(validPath(path)).toBe(true);
  });
});
