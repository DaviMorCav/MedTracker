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

// Check non-number filenames
const nonNumberNames = [];
fileApostilas.forEach(f => {
  const base = f.nome.replace(/\.[^/.]+$/, '');
  const num = parseInt(base, 10);
  if (isNaN(num)) {
    nonNumberNames.push({ nome: f.nome, caminho: f.caminho });
  }
});

console.log('Non-number names count:', nonNumberNames.length);
if (nonNumberNames.length > 0) {
  console.log('Sample non-number names:', nonNumberNames.slice(0, 10));
}

// Check extensions
const extensions = new Set();
fileApostilas.forEach(f => {
  const ext = f.nome.split('.').pop();
  extensions.add(ext);
});
console.log('Extensions found in Apostila files:', Array.from(extensions));
