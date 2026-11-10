export const PUBLIC_STATUSES = new Set(['active']);
export function isVisible(listingStatus,placementStatus,platformApproved=true) {
 return PUBLIC_STATUSES.has(listingStatus) && placementStatus==='approved' && platformApproved;
}
export function canModerate(role){return role==='owner'||role==='moderator'}
export function canTransition(from,to){
 const transitions={draft:['active','archived'],active:['reserved','sold','archived','blocked'],
 reserved:['active','sold','archived','blocked'],sold:['archived'],archived:['active'],blocked:[]};
 return Boolean(transitions[from]?.includes(to));
}
export function normalizeText(s){return String(s).trim().replace(/\s+/g,' ').toLowerCase()}
export function dedupeListings(items){const ids=new Set();return items.filter(x=>ids.has(x.id)?false:(ids.add(x.id),true))}
