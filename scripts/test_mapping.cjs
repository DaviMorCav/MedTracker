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

// Build list of all volumes with their subjects
const allVolumes = [];
curriculum.subjects.forEach(s => {
  s.volumes.forEach(v => {
    allVolumes.push({
      subjectId: s.id,
      subjectName: s.name,
      volumeId: v.id,
      volumeName: v.name,
      apostila: v.apostila || []
    });
  });
});

console.log('Total volumes in curriculum:', allVolumes.length);

// Let's see the paths of the fileApostilas
const pathsSet = new Set();
fileApostilas.forEach(f => {
  const parts = f.caminho.split(' / ');
  // e.g. ["Nefrologia", "Nefrologia vol. 3 - ...", "Apostila", "28.mp4"]
  pathsSet.add(parts.slice(0, 2).join(' / '));
});

console.log('Unique volume paths in CSV:', Array.from(pathsSet).length);
console.log('Sample volume paths from CSV:');
console.log(Array.from(pathsSet).slice(0, 15));
