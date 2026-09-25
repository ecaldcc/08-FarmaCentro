/**
 * Development-only SMTP catcher (alternative to Mailpit when Docker is not available).
 * Listens on 127.0.0.1:1025, never delivers mail and prints every message to this console so the
 * developer can read the verification codes. Do not use it outside a local machine.
 *
 *   npm run dev:mail
 */
import net from 'node:net';

const PORT = 1025;

function decodeBody(raw: string): string {
  const [headerPart = '', ...bodyParts] = raw.split(/\r?\n\r?\n/);
  const body = bodyParts.join('\n\n');
  if (/content-transfer-encoding:\s*quoted-printable/i.test(headerPart)) {
    const bytes = body
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    return Buffer.from(bytes, 'latin1').toString('utf8');
  }
  if (/content-transfer-encoding:\s*base64/i.test(headerPart)) {
    return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  }
  return body;
}

function header(raw: string, name: string): string {
  return new RegExp(`^${name}:\\s*(.+)$`, 'im').exec(raw)?.[1]?.trim() ?? '';
}

const server = net.createServer((socket) => {
  let buffer = '';
  let inData = false;
  let message = '';
  socket.write('220 farmacentro-dev-mail ESMTP\r\n');
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let index: number;
    while ((index = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      if (inData) {
        if (line === '.') {
          inData = false;
          const subject = header(message, 'Subject');
          console.log('\n──────── correo recibido ────────');
          console.log(`Para: ${header(message, 'To')}`);
          console.log(`Asunto: ${subject}`);
          console.log(decodeBody(message).trim());
          message = '';
          socket.write('250 OK\r\n');
        } else {
          message += `${line.startsWith('..') ? line.slice(1) : line}\n`;
        }
        continue;
      }
      const command = line.slice(0, 4).toUpperCase();
      if (command === 'EHLO' || command === 'HELO') socket.write('250-farmacentro-dev-mail\r\n250 8BITMIME\r\n');
      else if (command === 'DATA') {
        inData = true;
        socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
      } else if (command === 'QUIT') {
        socket.write('221 Bye\r\n');
        socket.end();
      } else socket.write('250 OK\r\n');
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`SMTP de desarrollo escuchando en 127.0.0.1:${PORT} (no entrega correos reales).`);
});
