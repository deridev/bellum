export type Terrain = 'plains' | 'hills' | 'mountains' | 'forest' | 'jungle' | 'desert' | 'arctic';
export interface ProvinceData {
  id: number; name: string; pt?: string; es?: string; state?: string; statePt?: string; stateEs?: string; merged?: 1; country: string; label: [number, number]; area: number; terrain: Terrain; // state: the state a city region was cut from (merged: an artificial group, not shown)
  elev: number; rough: number; coastal: boolean; nbr: number[]; pop: number; gdp: number;
}
export interface CountryData { code: string; name: string; iso2: string; pop: number; gdp: number; capital: number; capitalName: string; color: string }
export interface CityData { name: string; pt?: string; es?: string; lon: number; lat: number; pop: number; prov: number; capital: boolean; rank: number }
export interface Mesh { pos: Float32Array; prov: Float32Array; index: Uint32Array }
export interface MapAssets {
  provinces: ProvinceData[]; countries: CountryData[]; cities: CityData[];
  mesh: Mesh; bbox: Float32Array; // per province [x0,y0,x1,y1] in world units
  rings: Float32Array[][]; // per province: projected rings (for label/geometry work)
  baseW: ImageBitmap; baseE: ImageBitmap; dem: ImageBitmap;
  demData: Uint8Array; // 4096x2048 raw elevation bytes for the sim
  flags: ImageBitmap; flagIndex: Record<string, [number, number]>; flagW: number; flagH: number; provRaster: Uint16Array;
}
