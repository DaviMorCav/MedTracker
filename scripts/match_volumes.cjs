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

const fileApostilas = dataRows.filter(r => r.caminho && r.caminho.toLowerCase().includes('/ apostila /'));

const curriculum = JSON.parse(fs.readFileSync('src/data/curriculum.json', 'utf8'));

// Build curriculum volume list
const curriculumVolumes = [];
curriculum.subjects.forEach(s => {
  s.volumes.forEach(v => {
    curriculumVolumes.push({
      subjectId: s.id,
      subjectName: s.name,
      volumeId: v.id,
      volumeName: v.name,
      pdf: v.pdf,
      apostila: v.apostila || []
    });
  });
});

// Let's see the unique folder paths before " / Apostila / "
const csvApostilaFolders = new Map();
fileApostilas.forEach(f => {
  const parts = f.caminho.split(' / ');
  const folderPath = parts.slice(0, parts.length - 2).join(' / ');
  if (!csvApostilaFolders.has(folderPath)) {
    csvApostilaFolders.set(folderPath, []);
  }
  csvApostilaFolders.get(folderPath).push(f);
});

console.log('CSV folders with Apostila:', csvApostilaFolders.size);

// Try to match each CSV folder with a curriculum volume
const matches = [];
const unmatchedCSV = [];

for (const [folderPath, files] of csvApostilaFolders.entries()) {
  const folderParts = folderPath.split(' / ');
  const subNameInCSV = folderParts[0].trim();
  const volNameInCSV = folderParts[1] ? folderParts[1].trim() : folderParts[0].trim();

  // Try matching
  let matchedVol = curriculumVolumes.find(cv => {
    // Exact or normalized comparison
    const normVol = cv.volumeName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normCSV = volNameInCSV.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normVol === normCSV;
  });

  if (!matchedVol) {
    // Try matching with subject + vol number
    const volNumMatch = volNameInCSV.match(/vol\.?\s*(\d+)/i);
    const subMatch = curriculum.subjects.find(s => 
      s.name.toLowerCase().replace(/[^a-z0-9]/g, '') === subNameInCSV.toLowerCase().replace(/[^a-z0-9]/g, '')
    );
    if (subMatch) {
      if (volNumMatch) {
        const num = volNumMatch[1];
        matchedVol = subMatch.volumes.find(v => v.id.endsWith(`-v${num}`));
      } else if (subMatch.volumes.length === 1) {
        matchedVol = subMatch.volumes[0];
      }
    }
  }

  if (matchedVol) {
    matches.push({
      folderPath,
      volumeId: matchedVol.id || matchedVol.volumeId,
      volumeName: matchedVol.name || matchedVol.volumeName,
      filesCount: files.length
    });
  } else {
    unmatchedCSV.push({ folderPath, filesCount: files.length });
  }
}

console.log('Matched folders:', matches.length);
console.log('Unmatched folders:', unmatchedCSV);

// Check which curriculum volumes were NOT matched
const matchedVolumeIds = new Set(matches.map(m => m.volumeId));
const unmatchedCurriculum = curriculumVolumes.filter(cv => !matchedVolumeIds.has(cv.volumeId));
console.log('Curriculum volumes without CSV match:', unmatchedCurriculum.map(cv => ({ id: cv.volumeId, name: cv.volumeName, apostilaLen: cv.apostila.length })));
