export const FULLSCREEN_VS = `#version 300 es
in vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

export interface Program { p: WebGLProgram; u: Record<string, WebGLUniformLocation> }
export function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); throw new Error('Shader error: ' + log + '\n' + src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n')); }
  return s;
}
export function program(gl: WebGL2RenderingContext, vs: string, fs: string, attribs: string[] = ['aPos']): Program {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  attribs.forEach((a, i) => gl.bindAttribLocation(p, i, a)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link failed');
  const u: Record<string, WebGLUniformLocation> = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i)!; u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name)!; }
  return { p, u };
}
export type TexFmt = 'r8' | 'rg8' | 'rgba8';
export function texture(gl: WebGL2RenderingContext, w: number, h: number, fmt: TexFmt, data: ArrayBufferView | TexImageSource | null, o: { linear?: boolean; mip?: boolean; repeatX?: boolean } = {}) {
  const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const [ifmt, f] = fmt === 'r8' ? [gl.R8, gl.RED] : fmt === 'rg8' ? [gl.RG8, gl.RG] : [gl.RGBA8, gl.RGBA];
  if (data && !ArrayBuffer.isView(data)) gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, f, gl.UNSIGNED_BYTE, data as TexImageSource);
  else gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, f, gl.UNSIGNED_BYTE, data as ArrayBufferView | null);
  const lin = o.linear !== false;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, o.mip ? gl.LINEAR_MIPMAP_LINEAR : lin ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, lin ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, o.repeatX ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (o.mip) gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}
export function updateTexture(gl: WebGL2RenderingContext, t: WebGLTexture, w: number, h: number, fmt: TexFmt, data: ArrayBufferView) {
  gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, fmt === 'r8' ? gl.RED : fmt === 'rg8' ? gl.RG : gl.RGBA, gl.UNSIGNED_BYTE, data);
}
export function hexToRgb(hex: string): [number, number, number] { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
