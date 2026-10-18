// Scenario tables for 2026 (approximate public figures; tuned for play, not a reference).
import type { Gov, Personality } from './types';

/** Active military personnel (thousands). Countries not listed get a size from population and wealth. */
export const ACTIVE_K: Record<string, number> = {
  CHN: 2035, IND: 1455, USA: 1330, PRK: 1280, RUS: 1320, UKR: 950, PAK: 654, IRN: 610, KOR: 500, VNM: 480,
  EGY: 440, MMR: 400, IDN: 400, BRA: 366, THA: 360, TUR: 355, COL: 293, SAU: 257, JPN: 247, MEX: 236,
  FRA: 203, ERI: 200, POL: 202, MAR: 196, IRQ: 193, ISR: 170, TWN: 169, ITA: 165, SYR: 150, DEU: 182,
  GBR: 150, ETH: 162, DZA: 139, NGA: 143, AFG: 150, BGD: 163, PHL: 145, VEN: 123, SDN: 104, ESP: 133,
  KAZ: 39, AZE: 67, ARM: 42, GRC: 142, CUB: 49, PER: 81, ARG: 74, CHL: 69, ZAF: 73, UZB: 48, BLR: 48,
  ROU: 71, AUS: 59, CAN: 68, ARE: 63, KWT: 17, JOR: 101, LBY: 40, YEM: 40, SRB: 28, HUN: 32, CZE: 27,
  NLD: 34, BEL: 23, SWE: 15, NOR: 23, FIN: 24, DNK: 15, PRT: 24, AUT: 16, CHE: 20, SGP: 51, MYS: 113,
  LKA: 255, NPL: 96, KHM: 124, LAO: 29, MNG: 10, TKM: 37, TJK: 9, KGZ: 11, OMN: 43, QAT: 17, LBN: 60,
  TUN: 36, KEN: 24, TZA: 27, UGA: 45, COD: 134, AGO: 107, SSD: 185, SOM: 20, ZWE: 29, NZL: 9, IRL: 8, BGR: 37, SVK: 16,
};
/** Military spending, % of GDP. Default 1.5. */
export const MIL_GDP: Record<string, number> = {
  USA: 3.4, CHN: 1.7, RUS: 6.5, IND: 2.4, SAU: 6.5, GBR: 2.3, DEU: 2.1, FRA: 2.1, JPN: 1.6, KOR: 2.6, UKR: 30,
  ISR: 6, IRN: 2.2, TUR: 1.8, PAK: 2.8, PRK: 18, POL: 4.1, ITA: 1.6, AUS: 2.0, CAN: 1.4, BRA: 1.1, TWN: 2.6,
  DZA: 4.8, EGY: 1.2, IRQ: 3.0, ARE: 4.5, OMN: 5.5, QAT: 4.0, KWT: 4.4, JOR: 4.8, GRC: 3.1, ARM: 4.0, AZE: 5.0,
  BLR: 1.5, KAZ: 1.0, MAR: 3.5, MMR: 3.5, SYR: 4.0, ERI: 10, LTU: 3.1, LVA: 3.1, EST: 3.4, FIN: 2.4, SWE: 2.2, NOR: 2.0,
};
/** Government types (default: democracy). */
export const GOV: Record<string, Gov> = {
  CHN: 'oneparty', PRK: 'oneparty', VNM: 'oneparty', LAO: 'oneparty', CUB: 'oneparty', ERI: 'oneparty',
  RUS: 'authoritarian', BLR: 'authoritarian', AZE: 'authoritarian', TKM: 'authoritarian', TJK: 'authoritarian', UZB: 'authoritarian', KAZ: 'authoritarian',
  VEN: 'authoritarian', NIC: 'authoritarian', SYR: 'authoritarian', EGY: 'authoritarian', DZA: 'authoritarian', RWA: 'authoritarian', ETH: 'authoritarian', TUR: 'authoritarian', KHM: 'authoritarian', SSD: 'authoritarian', CMR: 'authoritarian', TCD: 'authoritarian', UGA: 'authoritarian', ZWE: 'authoritarian',
  IRN: 'theocracy', AFG: 'theocracy',
  SAU: 'monarchy', ARE: 'monarchy', QAT: 'monarchy', OMN: 'monarchy', KWT: 'monarchy', BHR: 'monarchy', BRN: 'monarchy', SWZ: 'monarchy', JOR: 'monarchy', MAR: 'monarchy',
  MMR: 'junta', MLI: 'junta', BFA: 'junta', NER: 'junta', GIN: 'junta', SDN: 'junta', GAB: 'junta', LBY: 'junta',
};
/** Blocs: shared defence and friendly relations. */
export const BLOCS: Record<string, { name: string; members: string[]; alliance: boolean }> = {
  atlantic: { name: 'Atlantic Alliance', alliance: true, members: ['USA', 'CAN', 'GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'PRT', 'NLD', 'BEL', 'LUX', 'DNK', 'NOR', 'ISL', 'POL', 'CZE', 'SVK', 'HUN', 'ROU', 'BGR', 'GRC', 'TUR', 'EST', 'LVA', 'LTU', 'SVN', 'HRV', 'ALB', 'MNE', 'MKD', 'FIN', 'SWE'] },
  csto: { name: 'Collective Security Pact', alliance: true, members: ['RUS', 'BLR', 'KAZ', 'KGZ', 'TJK', 'ARM'] },
  pacific: { name: 'Pacific Partnership', alliance: false, members: ['JPN', 'KOR', 'AUS', 'NZL', 'PHL', 'TWN'] },
  gulf: { name: 'Gulf Council', alliance: true, members: ['SAU', 'ARE', 'QAT', 'KWT', 'BHR', 'OMN'] },
  axis: { name: 'Axis of Resistance', alliance: false, members: ['IRN', 'SYR', 'YEM'] },
  bolivar: { name: 'Bolivarian Bloc', alliance: false, members: ['VEN', 'CUB', 'NIC', 'BOL'] },
  sahel: { name: 'Sahel Confederation', alliance: true, members: ['MLI', 'BFA', 'NER'] },
};
/** Bilateral treaties at start. */
export const START_TREATIES: [string, string, 'alliance' | 'guarantee' | 'nap'][] = [
  ['USA', 'JPN', 'alliance'], ['USA', 'KOR', 'alliance'], ['USA', 'AUS', 'alliance'], ['USA', 'PHL', 'alliance'], ['USA', 'TWN', 'guarantee'], ['USA', 'ISR', 'guarantee'],
  ['CHN', 'PRK', 'alliance'], ['RUS', 'PRK', 'alliance'], ['CHN', 'PAK', 'nap'], ['RUS', 'CHN', 'nap'], ['RUS', 'IRN', 'nap'], ['IND', 'RUS', 'nap'],
];
/** Rivalries: [a, b, opinion]. */
export const RIVALS: [string, string, number][] = [
  ['IND', 'PAK', -75], ['KOR', 'PRK', -85], ['CHN', 'TWN', -80], ['ISR', 'IRN', -90], ['ARM', 'AZE', -70], ['GRC', 'TUR', -35], ['RUS', 'UKR', -100],
  ['USA', 'IRN', -70], ['USA', 'PRK', -80], ['USA', 'RUS', -55], ['USA', 'CHN', -35], ['CHN', 'IND', -40], ['JPN', 'CHN', -40], ['JPN', 'PRK', -70],
  ['SAU', 'IRN', -55], ['ETH', 'ERI', -60], ['SDN', 'SSD', -45], ['MAR', 'DZA', -50], ['VEN', 'GUY', -50], ['SRB', 'KOS', -70], ['ISR', 'SYR', -70],
  ['PAK', 'AFG', -40], ['CHN', 'PHL', -35], ['CHN', 'VNM', -25], ['RUS', 'POL', -60], ['RUS', 'EST', -50], ['RUS', 'LVA', -50], ['RUS', 'LTU', -50], ['RUS', 'GEO', -60], ['RUS', 'FIN', -40],
  ['TUR', 'SYR', -45], ['EGY', 'ETH', -35], ['COL', 'VEN', -30], ['KHM', 'THA', -25], ['IRQ', 'IRN', 10], ['BLR', 'POL', -45],
];
export const FRIENDS: [string, string, number][] = [['USA', 'UKR', 60], ['GBR', 'UKR', 75], ['POL', 'UKR', 75], ['DEU', 'UKR', 60], ['FRA', 'UKR', 60], ['CAN', 'UKR', 65], ['NLD', 'UKR', 65], ['SWE', 'UKR', 65], ['DNK', 'UKR', 65], ['FIN', 'UKR', 65], ['LTU', 'UKR', 75], ['EST', 'UKR', 75], ['LVA', 'UKR', 75], ['NOR', 'UKR', 60], ['CZE', 'UKR', 60], ['IRN', 'RUS', 55], ['PRK', 'RUS', 60], ['BLR', 'RUS', 90], ['RUS', 'BLR', 85], ['CHN', 'PAK', 70], ['USA', 'ISR', 75], ['USA', 'GBR', 80], ['RUS', 'SYR', 50], ['IRN', 'SYR', 65], ['CHN', 'RUS', 45], ['IND', 'RUS', 35], ['TUR', 'AZE', 75], ['RUS', 'ARM', 20], ['SAU', 'EGY', 50]];

/** Ideology [economy, authority] by government type, with nudges. */
export const IDEOLOGY_NUDGE: Record<string, [number, number]> = { USA: [0.6, 0.1], CHN: [-0.1, 0.85], PRK: [-0.9, 1], CUB: [-0.8, 0.7], VEN: [-0.6, 0.6], SWE: [-0.1, -0.5], RUS: [0.2, 0.75], IRN: [-0.2, 0.9], SAU: [0.3, 0.9] };
export const PERSONALITY: Record<string, Personality> = {
  RUS: 'expansionist', CHN: 'opportunist', PRK: 'ideologue', IRN: 'ideologue', TUR: 'opportunist', USA: 'opportunist', ISR: 'defensive', IND: 'defensive', PAK: 'opportunist',
  AZE: 'expansionist', VEN: 'opportunist', SAU: 'opportunist', ETH: 'expansionist', ERI: 'defensive', CHE: 'isolationist', JPN: 'defensive', DEU: 'defensive', BRA: 'isolationist',
};

/** Culture groups for generated leader and general names. */
export const CULTURE_OF: Record<string, string> = {};
const C: Record<string, string[]> = {
  anglo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL', 'IRL', 'JAM', 'BHS', 'GUY', 'BLZ', 'TTO', 'BRB'],
  hispanic: ['MEX', 'ESP', 'ARG', 'COL', 'PER', 'VEN', 'CHL', 'ECU', 'BOL', 'PRY', 'URY', 'CUB', 'DOM', 'GTM', 'HND', 'SLV', 'NIC', 'CRI', 'PAN', 'GNQ'],
  lusophone: ['BRA', 'PRT', 'AGO', 'MOZ', 'GNB', 'TLS', 'CPV'],
  french: ['FRA', 'BEL', 'LUX', 'CHE', 'HTI', 'SEN', 'CIV', 'MLI', 'BFA', 'NER', 'GIN', 'BEN', 'TGO', 'CMR', 'GAB', 'COG', 'COD', 'CAF', 'TCD', 'MDG', 'BDI', 'RWA', 'DJI'],
  german: ['DEU', 'AUT', 'NLD', 'DNK', 'NOR', 'SWE', 'ISL', 'FIN', 'EST'],
  italian: ['ITA', 'MLT', 'SMR', 'ALB'],
  slavic_e: ['RUS', 'UKR', 'BLR', 'MDA'],
  slavic: ['POL', 'CZE', 'SVK', 'SRB', 'HRV', 'BIH', 'MNE', 'MKD', 'BGR', 'SVN', 'LVA', 'LTU', 'KOS'],
  romance_e: ['ROU', 'GRC', 'CYP', 'HUN', 'GEO', 'ARM'],
  turkic: ['TUR', 'AZE', 'KAZ', 'UZB', 'TKM', 'KGZ', 'CYN'],
  persian: ['IRN', 'AFG', 'TJK'],
  arabic: ['SAU', 'EGY', 'IRQ', 'SYR', 'JOR', 'LBN', 'PSX', 'YEM', 'OMN', 'ARE', 'QAT', 'KWT', 'BHR', 'LBY', 'TUN', 'DZA', 'MAR', 'SDN', 'MRT', 'SAH', 'SOM', 'SOL'],
  hebrew: ['ISR'],
  south_asian: ['IND', 'PAK', 'BGD', 'NPL', 'LKA', 'BTN'],
  chinese: ['CHN', 'TWN', 'SGP', 'MNG'],
  korean: ['KOR', 'PRK'],
  japanese: ['JPN'],
  se_asian: ['VNM', 'THA', 'LAO', 'KHM', 'MMR', 'MYS', 'IDN', 'PHL', 'BRN', 'PNG', 'FJI'],
  african: ['NGA', 'GHA', 'KEN', 'TZA', 'UGA', 'ETH', 'ERI', 'SSD', 'ZAF', 'ZWE', 'ZMB', 'MWI', 'BWA', 'NAM', 'LSO', 'SWZ', 'SLE', 'LBR', 'GMB'],
};
for (const [cult, list] of Object.entries(C)) for (const c of list) CULTURE_OF[c] = cult;
export const NAMES: Record<string, [string[], string[]]> = {
  anglo: [['James', 'Sarah', 'Michael', 'Emily', 'Robert', 'Grace', 'Daniel', 'Helen', 'Thomas', 'Claire', 'Andrew', 'Laura', 'Peter', 'Diane', 'Mark'], ['Whitfield', 'Harlow', 'Carver', 'Ashford', 'Bennett', 'Mercer', 'Hollis', 'Langley', 'Prescott', 'Dalton', 'Fairbanks', 'Grayson', 'Holloway', 'Pierce']],
  hispanic: [['Alejandro', 'Lucía', 'Mateo', 'Valentina', 'Javier', 'Camila', 'Diego', 'Elena', 'Rafael', 'Isabel', 'Andrés', 'Marisol'], ['Montoya', 'Ferrer', 'Salazar', 'Ibarra', 'Quintero', 'Delgado', 'Navarro', 'Rojas', 'Arriaga', 'Velasco', 'Cordero']],
  lusophone: [['João', 'Ana', 'Pedro', 'Beatriz', 'Rafael', 'Mariana', 'Tiago', 'Luísa'], ['Almeida', 'Teixeira', 'Barros', 'Cardoso', 'Moreira', 'Pacheco', 'Rezende', 'Campos']],
  french: [['Étienne', 'Claire', 'Mathieu', 'Sophie', 'Aurélien', 'Camille', 'Julien', 'Hélène', 'Moussa', 'Aïcha', 'Ibrahim', 'Fatou'], ['Delacroix', 'Moreau', 'Lefèvre', 'Garnier', 'Chevalier', 'Traoré', 'Diallo', 'Keïta', 'Faure', 'Rousseau']],
  german: [['Klaus', 'Anja', 'Matthias', 'Ingrid', 'Henrik', 'Sofie', 'Lars', 'Katrin', 'Jonas', 'Elin'], ['Brandt', 'Vogel', 'Lindqvist', 'Hartmann', 'Sørensen', 'Kessler', 'Dahl', 'Winter', 'Haugen', 'Richter']],
  italian: [['Marco', 'Giulia', 'Luca', 'Chiara', 'Paolo', 'Francesca', 'Enzo', 'Arta'], ['Ferraro', 'Bianchi', 'Galli', 'Marchetti', 'Rinaldi', 'Conti', 'Hoxha']],
  slavic_e: [['Dmitri', 'Olena', 'Pavel', 'Irina', 'Andrei', 'Viktor', 'Natalia', 'Bogdan', 'Svetlana', 'Mikhail', 'Oksana'], ['Volkov', 'Kovalenko', 'Sokolov', 'Petrov', 'Morozov', 'Lysenko', 'Orlov', 'Shevchenko', 'Belov', 'Tkachenko']],
  slavic: [['Milan', 'Jana', 'Katarzyna', 'Tomasz', 'Petra', 'Marek', 'Ivana', 'Luka', 'Agnieszka', 'Dragan'], ['Novak', 'Wiśniewski', 'Horvat', 'Kral', 'Kowalski', 'Jovanović', 'Dvořák', 'Petrović', 'Nowak', 'Kazlauskas']],
  romance_e: [['Andrei', 'Eleni', 'Nikos', 'Ioana', 'Gábor', 'Anna', 'Levan', 'Ani', 'Armen'], ['Popescu', 'Papadakis', 'Nagy', 'Kovács', 'Beridze', 'Hakobyan', 'Ionescu', 'Georgiou']],
  turkic: [['Mehmet', 'Ayşe', 'Emre', 'Zeynep', 'Nursultan', 'Aliya', 'Rustam', 'Dilnoza', 'Ilham'], ['Yıldız', 'Aydın', 'Kaya', 'Nazarbek', 'Aliyev', 'Karimov', 'Demir', 'Toktogul']],
  persian: [['Reza', 'Maryam', 'Ali', 'Shirin', 'Hossein', 'Farah', 'Ahmad', 'Laleh'], ['Tehrani', 'Karimi', 'Rahimi', 'Mousavi', 'Hosseini', 'Zand', 'Sadeghi']],
  arabic: [['Khalid', 'Layla', 'Omar', 'Fatima', 'Yusuf', 'Nour', 'Hassan', 'Amira', 'Tariq', 'Salma'], ['Al-Rashid', 'Haddad', 'Mansour', 'Al-Hashimi', 'Nasser', 'Khoury', 'Al-Farsi', 'Saleh', 'Barakat']],
  hebrew: [['David', 'Noa', 'Avi', 'Tamar', 'Eitan', 'Yael'], ['Levi', 'Cohen', 'Mizrahi', 'Peretz', 'Ben-Ami', 'Golan']],
  south_asian: [['Arjun', 'Priya', 'Rahul', 'Ananya', 'Imran', 'Ayesha', 'Vikram', 'Sunita', 'Farhan'], ['Sharma', 'Iyer', 'Chaudhry', 'Reddy', 'Malik', 'Bhatt', 'Qureshi', 'Rana', 'Banerjee']],
  chinese: [['Wei', 'Li', 'Jian', 'Mei', 'Hao', 'Ying', 'Batu', 'Lan', 'Zhen'], ['Zhang', 'Liu', 'Chen', 'Wang', 'Zhao', 'Huang', 'Lin', 'Xu', 'Sun']],
  korean: [['Min-jun', 'Seo-yeon', 'Ji-ho', 'Ha-eun', 'Dong-hyun', 'Su-bin'], ['Kim', 'Park', 'Lee', 'Choi', 'Jung', 'Kang', 'Yoon']],
  japanese: [['Hiroshi', 'Yuki', 'Kenji', 'Aiko', 'Takeshi', 'Haruka'], ['Tanaka', 'Sato', 'Watanabe', 'Kobayashi', 'Nakamura', 'Fujita']],
  se_asian: [['Nguyen', 'Siti', 'Somchai', 'Maria', 'Arif', 'Mai', 'Rizal', 'Dewi'], ['Tran', 'Santoso', 'Wongsa', 'Reyes', 'Rahman', 'Phan', 'Wijaya', 'Aung']],
  african: [['Kwame', 'Amara', 'Tunde', 'Wanjiru', 'Thabo', 'Nia', 'Abebe', 'Zola', 'Chidi'], ['Mensah', 'Okafor', 'Mwangi', 'Ndlovu', 'Kimani', 'Tesfaye', 'Banda', 'Adeyemi', 'Mutasa']],
};
export const GOV_TITLE: Record<Gov, string> = { democracy: 'President', authoritarian: 'President', oneparty: 'General Secretary', junta: 'Head of the Council', monarchy: 'King', theocracy: 'Supreme Leader' };
export const PM_COUNTRIES = new Set(['GBR', 'DEU', 'ITA', 'ESP', 'CAN', 'AUS', 'JPN', 'IND', 'NLD', 'BEL', 'SWE', 'NOR', 'DNK', 'NZL', 'IRL', 'GRC', 'HUN', 'CZE', 'ISR', 'PAK', 'BGD', 'THA', 'MYS', 'POL']);
export const LEADER_TRAITS = ['Cautious', 'Bold', 'Reformer', 'Hardliner', 'Pragmatic', 'Populist', 'Technocrat', 'Charismatic', 'Corrupt', 'War Hero', 'Diplomat', 'Isolationist', 'Hawk', 'Dove', 'Industrialist'];
