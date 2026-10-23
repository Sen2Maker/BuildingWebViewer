/** Fit only the operation hint into the space left between status and attribution. */
export function mountFooterHints(footer) {
  const doc=footer.ownerDocument,host=doc.defaultView;
  const hints=doc.createElement('span');hints.className='footer-hints';
  const spans=[...footer.children].filter(node=>node.matches('.desktop-hint,.touch-hint,.footer-detail'));
  if(!spans.length)return ()=>{};
  spans[0].before(hints);hints.append(...spans);
  let frame=null,disposed=false;
  function fit(){
    frame=null;if(disposed)return;
    hints.style.fontSize='';
    const base=parseFloat(host.getComputedStyle(hints).fontSize)||10;
    const available=Math.max(0,hints.clientWidth-2),natural=hints.scrollWidth;
    if(natural>available&&natural>0)hints.style.fontSize=`${Math.max(6,Math.floor(base*available/natural*100)/100)}px`;
  }
  const schedule=()=>{if(frame===null&&!disposed)frame=host.requestAnimationFrame(fit);};
  const observer=host.ResizeObserver?new host.ResizeObserver(schedule):null;
  for(const node of [footer,hints,footer.querySelector('.project-links')])if(node)observer?.observe(node);
  host.addEventListener('resize',schedule);fit();
  return ()=>{disposed=true;observer?.disconnect();host.removeEventListener('resize',schedule);if(frame!==null)host.cancelAnimationFrame(frame);};
}
