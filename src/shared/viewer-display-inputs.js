/** Recover empty/stale browser-restored selections at the UI boundary, not in the renderer API. */
export function readViewerDisplayInputs(root, previous = {}) {
  const result={};
  for(const [key,id,values] of [
    ['mode','display-mode',['solid','solid-wire','wire']],
    ['scale','scale-mode',['real','normalized']],
    ['colors','color-mode',['surface','height','building']],
  ]){
    const select=root.getElementById(id);
    const fallback=values.includes(previous[key])?previous[key]:values[0];
    const value=values.includes(select.value)?select.value:fallback;
    if(select.value!==value)select.value=value;
    result[key]=value;
  }
  return result;
}
