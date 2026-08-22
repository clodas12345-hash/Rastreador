const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const marker = `                      {/* Envio de Comandos por SMS / WhatsApp */}`;
const idx = code.indexOf(marker);
if (idx !== -1) {
  // Find the end of this added block or just cut it off before {modalMode === 'position' && or similar
  // Actually let's check what was before and after.
  console.log('Found marker at index', idx);
}
