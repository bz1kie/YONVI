export type ListingStatus='draft'|'active'|'reserved'|'sold'|'archived'|'blocked';
export type PlacementStatus='pending'|'approved'|'rejected'|'removed';
export type CommunityRole='owner'|'moderator';
export interface ListingDTO { id:string; sellerId:string; title:string; description:string; priceKopecks:number; city:string; category:string; status:ListingStatus; }
export interface PlacementDTO { id:string;listingId:string;communityId:string;status:PlacementStatus; }
