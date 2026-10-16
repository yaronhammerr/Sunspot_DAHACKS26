export type Scenery = "ocean" | "skyline" | "bridges" | "hills" | "greenery";
export type Photo = { url: string; author: string; license: string; sourceUrl: string; caption?: string; reviewId?: string };
export type Viewpoint = { id: string; name: string; lat: number; lng: number; county: string; description: string; tags: string[]; featured: number | null; directions?: [number, number][]; sourceUrl: string; photos: Photo[] };
export type Review = { id: string; displayName: string; body: string; photos: Photo[]; createdAt: number };
export type Catalog = { importedAt: string; counties: string[]; sources: {name: string;url: string}[]; viewpoints: Viewpoint[] };
export type Weather = { cloudCover: number | null; visibility: number | null; rainProbability: number | null; temperature: number | null; wind: number | null; forecastTime: number; fetchedAt: number };
