/** Bounded labels for multi-file scenes; source names remain in the project tree. */
export function compactNames(names, {maxItems=2,maxChars=96,separator=' + '}={}) {
  const values=Array.from(names||[],name=>String(name??'')).filter(Boolean);
  if(!values.length)return '';
  const shown=values.slice(0,maxItems),remaining=values.length-shown.length;
  const suffix=remaining?` … (+${remaining})`:'';
  const budget=Math.max(1,Math.floor((maxChars-Array.from(suffix).length-(shown.length-1)*Array.from(separator).length)/shown.length));
  return shown.map(name=>{const points=Array.from(name);return points.length>budget?points.slice(0,Math.max(0,budget-1)).join('')+'…':name;}).join(separator)+suffix;
}
export function setNameSummary(element,names,empty='') {
  element.textContent=compactNames(names)||empty;
  element.title=compactNames(names,{maxItems:8,maxChars:1024,separator:'\n'});
}
