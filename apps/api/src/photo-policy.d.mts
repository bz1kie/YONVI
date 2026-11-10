export declare const MAX_PHOTOS:number;
export declare const MAX_PHOTO_SIZE:number;
export declare const MEDIA_TYPES: Readonly<Record<string,string>>;
export declare function validatePhoto(type:unknown,bytes:unknown):boolean;
export declare function matchesPhotoMagic(type:string,header:Uint8Array):boolean;
