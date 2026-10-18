// Map projection: Miller cylindrical. World units are degrees: x = longitude,
// y = Miller(latitude) (≈ latitude near the equator, stretched toward the poles).
const RAD = Math.PI / 180;
export const millerY = (lat: number) => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * RAD)) / RAD;
export const invMiller = (y: number) => (2.5 * Math.atan(Math.exp(0.8 * y * RAD)) - 0.625 * Math.PI) / RAD;
export const project = (lon: number, lat: number): [number, number] => [lon, millerY(Math.max(-89, Math.min(89, lat)))];
export const unproject = (x: number, y: number): [number, number] => [((x + 180) % 360 + 360) % 360 - 180, invMiller(y)];
export const Y_MAX = millerY(84);
export const Y_MIN = millerY(-60);
/** great-circle-ish distance in km between two lon/lat points (equirectangular approximation) */
export function km(lon1: number, lat1: number, lon2: number, lat2: number) {
  let dl = Math.abs(lon1 - lon2); if (dl > 180) dl = 360 - dl;
  const x = dl * Math.cos(((lat1 + lat2) / 2) * RAD), y = lat1 - lat2;
  return Math.sqrt(x * x + y * y) * 111.2;
}
