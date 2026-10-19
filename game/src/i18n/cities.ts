// City names in Portuguese and Spanish where they differ from the English ones on the map data.
const PT: Record<string, string> = {
  'Mexico City': 'Cidade do México', 'New York': 'Nova York', Cairo: 'Cairo', Beijing: 'Pequim', Moscow: 'Moscou', Istanbul: 'Istambul', London: 'Londres', Seoul: 'Seul', Tehran: 'Teerã',
  Bogota: 'Bogotá', 'Hong Kong': 'Hong Kong', Taipei: 'Taipé', Bangkok: 'Bangkok', Santiago: 'Santiago', Madrid: 'Madri', Philadelphia: 'Filadélfia', 'Ho Chi Minh City': 'Cidade de Ho Chi Minh',
  Singapore: 'Singapura', Baghdad: 'Bagdá', Barcelona: 'Barcelona', Khartoum: 'Cartum', 'St.  Petersburg': 'São Petersburgo', Riyadh: 'Riad', Hanoi: 'Hanói', 'Washington,  D.C.': 'Washington',
  Alexandria: 'Alexandria', Detroit: 'Detroit', Yangon: 'Rangum', Ankara: 'Ancara', 'Montréal': 'Montreal', Berlin: 'Berlim', Algiers: 'Argel', Rome: 'Roma', Pyongyang: 'Pyongyang', Kabul: 'Cabul',
  Athens: 'Atenas', 'Cape Town': 'Cidade do Cabo', Casablanca: 'Casablanca', 'Addis Ababa': 'Adis Abeba', Milan: 'Milão', 'Dar es Salaam': 'Dar es Salaam', Frankfurt: 'Frankfurt', Lisbon: 'Lisboa',
  Aleppo: 'Alepo', Kyiv: 'Kiev', Giza: 'Gizé', Dakar: 'Dacar', 'İzmir': 'Esmirna', Damascus: 'Damasco', Tunis: 'Túnis', Vienna: 'Viena', Mannheim: 'Mannheim', Naples: 'Nápoles', Tripoli: 'Trípoli',
  Tashkent: 'Tashkent', Havana: 'Havana', 'Santo Domingo': 'São Domingos', Baku: 'Baku', 'Kuwait City': 'Cidade do Kuwait', Sanaa: 'Sanaa', 'Port-au-Prince': 'Porto Príncipe', Bucharest: 'Bucareste',
  'Asunción': 'Assunção', Beirut: 'Beirute', Minsk: 'Minsk', Hamburg: 'Hamburgo', Brussels: 'Bruxelas', Essen: 'Essen', Warsaw: 'Varsóvia', Rabat: 'Rabat', Quito: 'Quito', Budapest: 'Budapeste',
  Turin: 'Turim', Isfahan: 'Isfahan', Montevideo: 'Montevidéu', Florence: 'Florença', Kharkiv: 'Carcóvia', Doha: 'Doha', Lyon: 'Lyon', 'The Hague': 'Haia', Marseille: 'Marselha', Makkah: 'Meca',
  Dubai: 'Dubai', Pretoria: 'Pretória', Porto: 'Porto', Mosul: 'Mossul', 'Panama City': 'Cidade do Panamá', Munich: 'Munique', Stockholm: 'Estocolmo', Geneva: 'Genebra', Cologne: 'Colônia',
  'Düsseldorf': 'Düsseldorf', Seville: 'Sevilha', Sofia: 'Sófia', Banghazi: 'Bengasi', Prague: 'Praga', Glasgow: 'Glasgow', Ottawa: 'Ottawa', Helsinki: 'Helsinque', 'Zürich': 'Zurique',
  Yerevan: 'Erevã', Mogadishu: 'Mogadíscio', Tbilisi: 'Tbilisi', Belgrade: 'Belgrado', 'København': 'Copenhague', Amman: 'Amã', Dublin: 'Dublin', Rostov: 'Rostov', Odessa: 'Odessa',
  Amsterdam: 'Amsterdã', Jerusalem: 'Jerusalém', 'Guatemala City': 'Cidade da Guatemala', Rotterdam: 'Roterdã', Homs: 'Homs', Fez: 'Fez', Aden: 'Áden', Medina: 'Medina', Nice: 'Nice',
  Antwerpen: 'Antuérpia', Tirana: 'Tirana', Kathmandu: 'Katmandu', Ulaanbaatar: 'Ulan Bator', Oslo: 'Oslo', Islamabad: 'Islamabad', Riga: 'Riga', Muscat: 'Mascate', Zagreb: 'Zagreb',
  'Chișinău': 'Chisinau', 'Abu Dhabi': 'Abu Dhabi', Vilnius: 'Vilnius', Bratislava: 'Bratislava', Tallinn: 'Tallinn', Wellington: 'Wellington', Valletta: 'Valeta', Canberra: 'Camberra',
  'New Delhi': 'Nova Délhi', Delhi: 'Délhi', Mumbai: 'Mumbai', Bern: 'Berna', Nicosia: 'Nicósia', 'Reykjavík': 'Reykjavík', Luxembourg: 'Luxemburgo', 'Vatican City': 'Cidade do Vaticano',
  Babylon: 'Babilônia', Mashhad: 'Mashhad', Jeddah: 'Jidá', 'Tel Aviv': 'Tel Aviv', Haifa: 'Haifa', Novosibirsk: 'Novosibirsk', 'Nizhny Novgorod': 'Níjni Novgorod', Volgograd: 'Volgogrado',
};
const ES: Record<string, string> = {
  'Mexico City': 'Ciudad de México', 'New York': 'Nueva York', Cairo: 'El Cairo', Beijing: 'Pekín', Moscow: 'Moscú', Istanbul: 'Estambul', London: 'Londres', Seoul: 'Seúl', Tehran: 'Teherán',
  Bogota: 'Bogotá', Taipei: 'Taipéi', Philadelphia: 'Filadelfia', 'Ho Chi Minh City': 'Ciudad Ho Chi Minh', Singapore: 'Singapur', Baghdad: 'Bagdad', Khartoum: 'Jartum', 'St.  Petersburg': 'San Petersburgo',
  Riyadh: 'Riad', Hanoi: 'Hanói', 'Washington,  D.C.': 'Washington', Alexandria: 'Alejandría', Yangon: 'Rangún', Berlin: 'Berlín', Algiers: 'Argel', Rome: 'Roma', Kabul: 'Kabul', Athens: 'Atenas',
  'Cape Town': 'Ciudad del Cabo', 'Addis Ababa': 'Adís Abeba', Milan: 'Milán', Frankfurt: 'Fráncfort', Lisbon: 'Lisboa', Aleppo: 'Alepo', Kyiv: 'Kiev', Damascus: 'Damasco', Tunis: 'Túnez',
  Vienna: 'Viena', Naples: 'Nápoles', Tripoli: 'Trípoli', Havana: 'La Habana', 'Kuwait City': 'Kuwait', 'Port-au-Prince': 'Puerto Príncipe', Bucharest: 'Bucarest', Beirut: 'Beirut',
  Hamburg: 'Hamburgo', Brussels: 'Bruselas', Warsaw: 'Varsovia', Budapest: 'Budapest', Turin: 'Turín', Florence: 'Florencia', Kharkiv: 'Járkov', 'The Hague': 'La Haya', Marseille: 'Marsella',
  Makkah: 'La Meca', Munich: 'Múnich', Stockholm: 'Estocolmo', Geneva: 'Ginebra', Cologne: 'Colonia', Seville: 'Sevilla', Prague: 'Praga', Helsinki: 'Helsinki', 'Zürich': 'Zúrich', Yerevan: 'Ereván',
  Mogadishu: 'Mogadiscio', Belgrade: 'Belgrado', 'København': 'Copenhague', Amman: 'Amán', Amsterdam: 'Ámsterdam', Jerusalem: 'Jerusalén', 'Guatemala City': 'Ciudad de Guatemala', Rotterdam: 'Róterdam',
  Antwerpen: 'Amberes', Kathmandu: 'Katmandú', Ulaanbaatar: 'Ulán Bator', Muscat: 'Mascate', Valletta: 'La Valeta', 'New Delhi': 'Nueva Delhi', Bern: 'Berna', Nicosia: 'Nicosia', Luxembourg: 'Luxemburgo',
  'Vatican City': 'Ciudad del Vaticano', Babylon: 'Babilonia', Jeddah: 'Yeda', Nice: 'Niza', Odessa: 'Odesa', 'Panama City': 'Ciudad de Panamá', 'Santo Domingo': 'Santo Domingo', Mosul: 'Mosul',
};
/** Brazilian forms first (the map data's Portuguese is European: Nova Iorque, Nuremberga), then the data's own name for the language. */
export const cityTable = (lang: string, name: string): string | undefined => lang === 'pt' ? PT[name] : lang === 'es' ? ES[name] : undefined;
const DATA = new Map<string, { pt?: string; es?: string }>();
export function registerCities(list: { name: string; pt?: string; es?: string }[]) { for (const c of list) if (c.pt || c.es) DATA.set(c.name, { pt: c.pt, es: c.es }); }
export const cityNameIn = (lang: string, name: string) => cityTable(lang, name) ?? (lang === 'pt' || lang === 'es' ? DATA.get(name)?.[lang] : undefined) ?? name.replace(/\s{2,}/g, ' ');
