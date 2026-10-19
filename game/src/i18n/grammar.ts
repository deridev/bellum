// Articles and contractions for country names in Portuguese (and Spanish, for the historical states that take one):
// "de {c}" becomes "do Brasil", "da França", "dos Estados Unidos", "de Portugal"; a bare "{c}" becomes "o Brasil".
export type Gender = 'm' | 'f' | 'mp' | 'fp' | '';

const PT_NONE = new Set(['Portugal', 'Israel', 'Cuba', 'Malta', 'Andorra', 'Mônaco', 'San Marino', 'Singapura', 'Moçambique', 'Cabo Verde', 'São Tomé e Príncipe', 'Angola',
  'Madagascar', 'Taiwan', 'Hong Kong', 'Macau', 'Omã', 'Chipre', 'Honduras', 'El Salvador', 'Porto Rico', 'Granada', 'Santa Lúcia', 'Trinidad e Tobago', 'Barbados', 'Fiji',
  'Samoa', 'Tonga', 'Vanuatu', 'Nauru', 'Kiribati', 'Tuvalu', 'Palau', 'Gibraltar', 'Aruba', 'Curaçao', 'Ruanda', 'Uganda', 'Belize', 'Dominica', 'Jamaica',
  'São Cristóvão e Névis', 'Antígua e Barbuda', 'São Vicente e Granadinas', 'Mianmar', 'Myanmar (Birmânia)', 'Timor-Leste']);
const PT_MP = new Set(['Estados Unidos', 'Emirados Árabes Unidos', 'Países Baixos', 'Camarões']);
const PT_FP = new Set(['Filipinas', 'Bahamas', 'Maldivas', 'Seicheles', 'Comores', 'Ilhas Salomão', 'Ilhas Marshall', 'Ilhas Malvinas', 'Ilhas Faroé']);
const PT_M = new Set(['Quênia', 'Camboja', 'Gana', 'Canadá', 'Panamá', 'Botsuana', 'Sri Lanka', 'Saara Ocidental', 'Kosovo']);
const PT_F = new Set(['Guiné', 'Guiné-Bissau', 'Guiné Equatorial', 'Papua-Nova Guiné', 'Costa do Marfim']);
const PT_PREFIX_M = /^(Império|Reino|Reich|Grão-Ducado|Sultanato|Emirado|Estado|Principado|Xogunato|Canato|Domínio)\b/;
const PT_PREFIX_F = /^(União|República|Confederação|Federação|Monarquia)\b/;
const ES_PREFIX_M = /^(Imperio|Reino|Reich|Gran Ducado|Sultanato|Emirato|Estado|Principado|Shogunato|Kanato|Dominio)\b/;
const ES_PREFIX_F = /^(Unión|República|Confederación|Federación|Monarquía)\b/;

export function genderOf(name: string, lang: 'pt' | 'es'): Gender {
  if (lang === 'es') return ES_PREFIX_M.test(name) ? 'm' : ES_PREFIX_F.test(name) ? 'f' : '';
  if (PT_NONE.has(name)) return ''; if (PT_MP.has(name)) return 'mp'; if (PT_FP.has(name)) return 'fp';
  if (PT_M.has(name)) return 'm'; if (PT_F.has(name)) return 'f';
  if (PT_PREFIX_M.test(name)) return 'm'; if (PT_PREFIX_F.test(name)) return 'f';
  const first = name.split(/[\s-]/)[0];
  return /a$/.test(first) ? 'f' : 'm';
}
const ART = { pt: { m: 'o', f: 'a', mp: 'os', fp: 'as' }, es: { m: 'el', f: 'la', mp: 'los', fp: 'las' } } as const;
const PT_JOIN: Record<string, Record<'m' | 'f' | 'mp' | 'fp', string>> = {
  de: { m: 'do', f: 'da', mp: 'dos', fp: 'das' }, em: { m: 'no', f: 'na', mp: 'nos', fp: 'nas' }, a: { m: 'ao', f: 'à', mp: 'aos', fp: 'às' }, por: { m: 'pelo', f: 'pela', mp: 'pelos', fp: 'pelas' },
};
const ES_JOIN: Record<string, Partial<Record<'m' | 'f' | 'mp' | 'fp', string>>> = { de: { m: 'del' }, a: { m: 'al' } };

const SKIP = new Set(['city', 'p', 'leader', 'old', 'name', 'war', 'm', 't', 'u', 'g']); // arguments that are never a country, even when a city shares its name
/** Fill a template's {placeholders}, giving country names (those `gender` knows) their article and contracting it with the preposition before it. */
export function fillCountries(lang: 'pt' | 'es', e: string, args: Record<string, string | number>, gender: (v: string) => Gender | undefined, plain: (k: string) => string): string {
  return e.replace(/(^|[\s(])(?:(de|em|a|por|De|Em|A|Por) )?\{(\w+)\}/g, (all, pre: string, prep: string | undefined, k: string, off: number, src: string) => {
    const v = args[k], g = typeof v === 'string' && !SKIP.has(k) ? gender(v) : undefined;
    const after = src.slice(off + all.length, off + all.length + 2), before = src.slice(Math.max(0, off - 2), off + pre.length);
    if (!g || /[–→]/.test(after) || /[–→]/.test(before) || /^ ?vs/.test(after)) return pre + (prep ? prep + ' ' : '') + plain(k);
    const art = ART[lang][g], join = prep ? (lang === 'pt' ? PT_JOIN : ES_JOIN)[prep.toLowerCase()]?.[g] : undefined;
    let out = join ? `${join} ${v}` : prep ? `${prep} ${art} ${v}` : `${art} ${v}`;
    if (prep && prep[0] === prep[0].toUpperCase()) out = out[0].toUpperCase() + out.slice(1);
    else if (!prep && (off === 0 || /[.:!?]\s*$/.test(src.slice(0, off + pre.length)))) out = out[0].toUpperCase() + out.slice(1); // a sentence starts with it
    return pre + out;
  });
}
