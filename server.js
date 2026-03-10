/**
 * Servidor Local — Gestão Strada
 * Acesse de qualquer dispositivo na mesma rede WiFi
 * 
 * Uso: node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const HOST = '0.0.0.0'; // Listen on all network interfaces

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
};

const server = http.createServer((req, res) => {
    let filePath = req.url === '/' ? '/index.html' : req.url;

    // Remove query strings
    filePath = filePath.split('?')[0];

    // Security: prevent directory traversal
    filePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');

    const fullPath = path.join(__dirname, filePath);
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(fullPath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h1>404 — Arquivo não encontrado</h1>');
            } else {
                res.writeHead(500);
                res.end('Erro interno do servidor');
            }
            return;
        }

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
        });
        res.end(data);
    });
});

server.listen(PORT, HOST, () => {
    // Get local IP addresses
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const addresses = [];

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                addresses.push(iface.address);
            }
        }
    }

    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║     🏪 Gestão Strada — Servidor Local    ║');
    console.log('  ╠══════════════════════════════════════════╣');
    console.log(`  ║  Local:   http://localhost:${PORT}          ║`);

    if (addresses.length > 0) {
        addresses.forEach(addr => {
            const padded = `http://${addr}:${PORT}`;
            const spaces = ' '.repeat(Math.max(0, 28 - padded.length));
            console.log(`  ║  Rede:    ${padded}${spaces}║`);
        });
    }

    console.log('  ╠══════════════════════════════════════════╣');
    console.log('  ║  Conecte qualquer dispositivo na mesma   ║');
    console.log('  ║  rede WiFi usando o endereço de Rede.    ║');
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');
});
