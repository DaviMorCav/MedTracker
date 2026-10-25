const fs = require('fs');
const path = require('path');

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
console.log('Total rows in CSV:', rows.length);
const header = rows[0];
console.log('Header:', header);

const dataRows = rows.slice(1).map(r => ({
  nome: r[0],
  link: r[1],
  id: r[2],
  caminho: r[3]
}));

const apostilaRows = dataRows.filter(r => r.caminho && r.caminho.toLowerCase().includes('apostila'));
console.log('Total rows containing apostila:', apostilaRows.length);

const fileApostilas = apostilaRows.filter(r => r.caminho && r.caminho.toLowerCase().includes('/ apostila /'));
console.log('Total files inside / Apostila /:', fileApostilas.length);

console.log('First 15 sample files:');
fileApostilas.slice(0, 15).forEach(f => {
  console.log(`Nome: "${f.nome}" | ID: ${f.id} | Caminho: "${f.caminho}"`);
});

const curriculum = JSON.parse(fs.readFileSync('src/data/curriculum.json', 'utf8'));
console.log('Total curriculum subjects:', curriculum.subjects.length);

let totalCurriculumApostilaItems = 0;
curriculum.subjects.forEach(s => {
  s.volumes.forEach(v => {
    totalCurriculumApostilaItems += (v.apostila || []).length;
  });
});
console.log('Total curriculum apostila items:', totalCurriculumApostilaItems);
