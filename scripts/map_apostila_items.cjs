const fs = require('fs');

const csvPath = 'c:/Users/davim/Downloads/Links Medcurso com Caminho - Página1.csv';
const content = fs.readFileSync(csvPath, 'utf8');

function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (let line of lines) {
    if (!line.trim()) continue;
    const row = [];
    let insideQuotes = false;
    let field = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        insideQuotes = !insideQuotes;
      } else if (c === ',' && !insideQuotes) {
        row.push(field);
        field = '';
      } else {
        field += c;
      }
    }
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const rows = parseCSV(content);
const dataRows = rows.slice(1).map(r => ({
  nome: r[0],
  link: r[1],
  id: r[2],
  caminho: r[3]
}));

const curriculum = JSON.parse(fs.readFileSync('src/data/curriculum.json', 'utf8'));

const SUBJECT_MAP = {
  "cardiologia": "cardiologia",
  "cirurgia": "cirurgia",
  "cirurgia geral": "cirurgia",
  "cirurgia geral e trauma": "cirurgia",
  "dermatologia": "dermatologia",
  "endocrinologia": "endocrinologia",
  "gastroenterologia": "gastrologia",
  "gastrologia": "gastrologia",
  "ginecologia": "ginecologia",
  "hematologia": "hematologia",
  "hepatologia": "hepatologia",
  "infectologia": "infectologia",
  "nefrologia": "nefrologia",
  "neurologia": "neurologia",
  "obstetricia": "obstetricia",
  "oftalmologia": "oftalmologia",
  "ortopedia": "ortopedia",
  "pediatria": "pediatria",
  "pneumologia": "pneumologia",
  "preventiva": "preventiva",
  "medicina preventiva": "preventiva",
  "psiquiatria": "psiquiatria",
  "reumatologia": "reumatologia",
};

function normalize(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findVolume(sub, volFolderName) {
  const normFolder = normalize(volFolderName);
  
  // Specific Cirurgia folder mapping
  if (sub.id === 'cirurgia') {
    if (normFolder.includes('trauma')) return sub.volumes.find(v => v.id === 'cirurgia-v1');
    if (normFolder.includes('vol 1') || normFolder.includes('urologia')) return sub.volumes.find(v => v.id === 'cirurgia-v2');
    if (normFolder.includes('vol 2') || normFolder.includes('pre operatorio') || normFolder.includes('pre op')) return sub.volumes.find(v => v.id === 'cirurgia-v3');
    if (normFolder.includes('vol 3') || normFolder.includes('vascular')) return sub.volumes.find(v => v.id === 'cirurgia-v4');
  }

  // Check volume number
  const m = normFolder.match(/\b(?:vol(?:ume)?|v)\.?\s*(\d+)\b/);
  if (m) {
    const num = parseInt(m[1], 10);
    const byNum = sub.volumes.find(v => v.id === `${sub.id}-v${num}`);
    if (byNum) return byNum;
  }

  // If subject has only 1 volume
  if (sub.volumes.length === 1) {
    return sub.volumes[0];
  }

  // By name match
  for (const v of sub.volumes) {
    const normV = normalize(v.name);
    if (normV === normFolder || normV.includes(normFolder) || normFolder.includes(normV)) {
      return v;
    }
  }

  return null;
}

const apostilasMap = {}; // key: `${volumeId}-${number}` -> { driveId, name, link }
const unmatchedFiles = [];

dataRows.forEach(row => {
  const caminho = row.caminho || '';
  if (!caminho.toLowerCase().includes('/ apostila /')) return;

  const parts = caminho.split(' / ').map(p => p.trim());
  const subName = parts[0];
  const volName = parts.length > 3 ? parts[1] : parts[0];

  const subId = SUBJECT_MAP[normalize(subName)];
  if (!subId) {
    unmatchedFiles.push({ reason: 'subject_not_found', caminho, row });
    return;
  }

  const sub = curriculum.subjects.find(s => s.id === subId);
  if (!sub) {
    unmatchedFiles.push({ reason: 'subject_not_in_curriculum', caminho, row });
    return;
  }

  const vol = findVolume(sub, volName);
  if (!vol) {
    unmatchedFiles.push({ reason: 'volume_not_found', caminho, volName, row });
    return;
  }

  // File name
  const fileName = row.nome.trim();
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const num = parseInt(baseName, 10);

  if (isNaN(num)) {
    unmatchedFiles.push({ reason: 'not_a_number', caminho, fileName, row });
    return;
  }

  const key = `${vol.id}-${num}`;
  apostilasMap[key] = {
    volumeId: vol.id,
    page: num,
    driveId: row.id,
    fileName: fileName,
    link: row.link
  };
});

console.log('Successfully mapped apostila items:', Object.keys(apostilasMap).length);
console.log('Unmatched items:', unmatchedFiles.length);
if (unmatchedFiles.length > 0) {
  console.log('Sample unmatched:', unmatchedFiles.slice(0, 5));
}

// Build the nested structure: { volumeId: { pageStr: driveId } }
const apostilaItems = {};
for (const [key, val] of Object.entries(apostilasMap)) {
  const { volumeId, page, driveId } = val;
  if (!apostilaItems[volumeId]) apostilaItems[volumeId] = {};
  apostilaItems[volumeId][String(page)] = driveId;
}

// Merge into existing drive_links.json
const driveLinksPath = 'drive_links.json';
const driveLinks = JSON.parse(fs.readFileSync(driveLinksPath, 'utf8'));
driveLinks.apostilaItems = apostilaItems;
const jsonStr = JSON.stringify(driveLinks, null, 2);

fs.writeFileSync(driveLinksPath, jsonStr, 'utf8');
fs.writeFileSync('public/drive_links.json', jsonStr, 'utf8');

console.log('drive_links.json updated with apostilaItems.');
console.log('Volumes with apostila items:', Object.keys(apostilaItems).length);
