/** Per-directory, in-memory search index. Entries stay in original order and are
 * never mutated. Only the most recent normalized query/type result is retained;
 * replacing a downloaded directory creates a new index and drops the old cache.
 */
export function createPreviewDirectoryIndex(entries) {
  const rows=entries.map(entry=>({entry,type:entry.viewer,text:`${entry.name||''} ${entry.id} ${entry.format}`.toLowerCase()}));
  let previousQuery,previousType,result=null,filterPasses=0,examinedEntries=0;
  return {
    search(query='',type='all') {
      const normalized=String(query).trim().toLowerCase();
      if(result!==null&&normalized===previousQuery&&type===previousType)return result;
      previousQuery=normalized;previousType=type;filterPasses++;
      const matches=[];
      for(const row of rows){examinedEntries++;if((type==='all'||row.type===type)&&row.text.includes(normalized))matches.push(row.entry);}
      result=Object.freeze(matches);return result;
    },
    // Counts contain no query or dataset content; useful for deterministic
    // regression tests without machine-dependent elapsed-time assertions.
    stats(){return {indexedEntries:rows.length,filterPasses,examinedEntries};},
  };
}
