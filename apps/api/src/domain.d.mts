export function isVisible(listingStatus:string,placementStatus:string,platformApproved?:boolean):boolean;
export function canModerate(role:string):boolean;
export function canTransition(from:string,to:string):boolean;
export function normalizeText(s:string):string;
export function dedupeListings<T extends {id:string}>(items:T[]):T[];
