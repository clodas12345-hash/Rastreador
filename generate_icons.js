import sharp from 'sharp';
import fs from 'fs';

async function generateAssets() {
  // SVG Icon with GKD Mobility GPS Car Design
  const iconSvg = `
  <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#020617"/>
      </linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#38bdf8"/>
        <stop offset="100%" stop-color="#2563eb"/>
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="8" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>
    </defs>
    
    <!-- Background Circle -->
    <rect width="512" height="512" rx="110" fill="url(#bg)"/>
    
    <!-- Radar Rings -->
    <circle cx="256" cy="230" r="150" fill="none" stroke="#1e293b" stroke-width="6"/>
    <circle cx="256" cy="230" r="100" fill="none" stroke="#2563eb" stroke-width="4" stroke-dasharray="12 8" opacity="0.6"/>
    <circle cx="256" cy="230" r="50" fill="none" stroke="#38bdf8" stroke-width="4" opacity="0.8"/>

    <!-- GPS Pin Glow & Body -->
    <path d="M256 100 C195 100 146 149 146 210 C146 290 256 370 256 370 C256 370 366 290 366 210 C366 149 317 100 256 100 Z" fill="url(#accent)" filter="url(#glow)"/>
    
    <!-- Car Silhouette inside Pin -->
    <!-- Car Top -->
    <path d="M230 190 L240 165 L272 165 L282 190 Z" fill="#0f172a"/>
    <!-- Car Body -->
    <rect x="215" y="188" width="82" height="26" rx="6" fill="#0f172a"/>
    <!-- Wheels -->
    <circle cx="230" cy="214" r="8" fill="#38bdf8"/>
    <circle cx="282" cy="214" r="8" fill="#38bdf8"/>
    <circle cx="230" cy="214" r="3" fill="#ffffff"/>
    <circle cx="282" cy="214" r="3" fill="#ffffff"/>
    <!-- Headlights -->
    <rect x="290" y="193" width="5" height="7" rx="2" fill="#38bdf8"/>
    <rect x="217" y="193" width="5" height="7" rx="2" fill="#ef4444"/>

    <!-- App Title Text -->
    <text x="256" y="440" font-family="system-ui, -apple-system, sans-serif" font-size="42" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="3">GKD MOBILITY</text>
    <text x="256" y="475" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="600" fill="#38bdf8" text-anchor="middle" letter-spacing="6">GPS TRACKER</text>
  </svg>
  `;

  // Safe Maskable Icon (safe zone padding)
  const maskableSvg = `
  <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" fill="#020617"/>
    <g transform="translate(64, 64) scale(0.75)">
      ${iconSvg.replace('<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">', '').replace('</svg>', '')}
    </g>
  </svg>
  `;

  // Screenshot Mobile SVG
  const screenshotNarrowSvg = `
  <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1920" fill="#020617"/>
    <!-- Top Bar -->
    <rect x="0" y="0" width="1080" height="160" fill="#0f172a"/>
    <text x="60" y="105" font-family="system-ui" font-size="44" font-weight="bold" fill="#ffffff">GKD MOBILITY - GPS</text>
    <rect x="860" y="60" width="160" height="60" rx="30" fill="#2563eb"/>
    <text x="940" y="100" font-family="system-ui" font-size="28" font-weight="bold" fill="#ffffff" text-anchor="middle">ONLINE</text>
    
    <!-- Map Canvas Mock -->
    <rect x="40" y="200" width="1000" height="1100" rx="32" fill="#1e293b"/>
    <circle cx="540" cy="700" r="280" fill="none" stroke="#334155" stroke-width="4"/>
    <circle cx="540" cy="700" r="160" fill="none" stroke="#2563eb" stroke-width="6" opacity="0.4"/>
    
    <!-- Marker on Map -->
    <circle cx="540" cy="700" r="50" fill="#2563eb" opacity="0.3"/>
    <circle cx="540" cy="700" r="30" fill="#38bdf8"/>
    
    <!-- Vehicle Info Card -->
    <rect x="40" y="1340" width="1000" height="480" rx="32" fill="#0f172a" stroke="#334155" stroke-width="3"/>
    <text x="90" y="1420" font-family="system-ui" font-size="48" font-weight="bold" fill="#ffffff">Hilux CD SRX 4x4</text>
    <rect x="800" y="1375" width="190" height="55" rx="16" fill="#16a34a"/>
    <text x="895" y="1412" font-family="system-ui" font-size="28" font-weight="bold" fill="#ffffff" text-anchor="middle">EM MOVIMENTO</text>
    
    <text x="90" y="1510" font-family="system-ui" font-size="36" fill="#94a3b8">Velocidade: <tspan font-weight="bold" fill="#38bdf8">68 km/h</tspan></text>
    <text x="90" y="1580" font-family="system-ui" font-size="36" fill="#94a3b8">Bateria: <tspan font-weight="bold" fill="#22c55e">98% (13.8V)</tspan></text>
    <text x="90" y="1650" font-family="system-ui" font-size="36" fill="#94a3b8">Satélites GPS: <tspan font-weight="bold" fill="#e2e8f0">16 Conectados</tspan></text>
    <text x="90" y="1720" font-family="system-ui" font-size="32" fill="#64748b">Última atualização: Agora mesmo</text>
  </svg>
  `;

  // Screenshot Desktop Wide SVG
  const screenshotWideSvg = `
  <svg width="1920" height="1080" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
    <rect width="1920" height="1080" fill="#020617"/>
    <!-- Sidebar -->
    <rect x="0" y="0" width="460" height="1080" fill="#0f172a" stroke="#1e293b" stroke-width="2"/>
    <text x="50" y="80" font-family="system-ui" font-size="36" font-weight="bold" fill="#ffffff">GKD MOBILITY</text>
    <rect x="40" y="140" width="380" height="160" rx="16" fill="#1e293b"/>
    <text x="70" y="200" font-family="system-ui" font-size="28" font-weight="bold" fill="#ffffff">Hilux SRX 4x4</text>
    <text x="70" y="250" font-family="system-ui" font-size="24" fill="#22c55e">● Em Movimento (68 km/h)</text>
    
    <!-- Map Center -->
    <rect x="480" y="20" width="1420" height="1040" rx="24" fill="#1e293b"/>
    <circle cx="1190" cy="540" r="300" fill="none" stroke="#334155" stroke-width="4"/>
    <circle cx="1190" cy="540" r="60" fill="#2563eb" opacity="0.3"/>
    <circle cx="1190" cy="540" r="35" fill="#38bdf8"/>
  </svg>
  `;

  const targets = ['public', 'dist', 'netlify_deploy', '.'];

  for (const dir of targets) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // 512x512 PNG
    await sharp(Buffer.from(iconSvg)).resize(512, 512).png().toFile(`${dir}/icon-512.png`);
    // 192x192 PNG
    await sharp(Buffer.from(iconSvg)).resize(192, 192).png().toFile(`${dir}/icon-192.png`);
    // 512x512 Maskable
    await sharp(Buffer.from(maskableSvg)).resize(512, 512).png().toFile(`${dir}/icon-maskable.png`);
    // 192x192 Maskable
    await sharp(Buffer.from(maskableSvg)).resize(192, 192).png().toFile(`${dir}/icon-192-maskable.png`);
    // Screenshots
    await sharp(Buffer.from(screenshotNarrowSvg)).resize(1080, 1920).png().toFile(`${dir}/screenshot-narrow.png`);
    await sharp(Buffer.from(screenshotWideSvg)).resize(1920, 1080).png().toFile(`${dir}/screenshot-wide.png`);
  }

  console.log('All real PNG icons and screenshots generated successfully!');
}

generateAssets().catch(console.error);
