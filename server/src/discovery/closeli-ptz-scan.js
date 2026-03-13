import { CloseLiTelnet } from '../closeli/telnetHelper.js';

const CAMERA_IP = process.argv[2] || '10.0.0.9';

const COMMANDS = [
  { cmd: 'uname -a', waitMs: 3000 },
  { cmd: '/bin/busybox', waitMs: 4000 },
  { cmd: '/bin/busybox --list', waitMs: 6000 },
  { cmd: '/bin/busybox ps', waitMs: 6000 },
  { cmd: 'ls -la /usr/bin/strings /bin/strings /usr/sbin/strings /sbin/strings 2>/dev/null', waitMs: 6000 },
  { cmd: '/app/t23prj --help 2>/dev/null', waitMs: 6000 },
  { cmd: '/app/t23prj -h 2>/dev/null', waitMs: 6000 },
  { cmd: 'ls -la /app 2>/dev/null', waitMs: 6000 },
  { cmd: 'ls -la /media 2>/dev/null', waitMs: 6000 },
  { cmd: 'ls -la /tmp 2>/dev/null', waitMs: 6000 },
  { cmd: 'ls -la /tmp | /bin/busybox grep -i -n -e ptz -e motor -e servo -e fifo 2>/dev/null', waitMs: 6000 },
  { cmd: 'find /tmp -maxdepth 3 -type p 2>/dev/null | sed -n "1,120p"', waitMs: 12000 },
  { cmd: 'find /tmp -maxdepth 3 -type s 2>/dev/null | sed -n "1,120p"', waitMs: 12000 },
  { cmd: 'ls -la /dev 2>/dev/null', waitMs: 6000 },
  { cmd: 'ls -la /dev | /bin/busybox grep -i -n -e ptz -e motor -e servo -e pwm -e gpio 2>/dev/null', waitMs: 6000 },
  { cmd: 'ls -la /dev/motor* 2>/dev/null', waitMs: 6000 },
  { cmd: 'cat /proc/devices 2>/dev/null | /bin/busybox grep -i motor', waitMs: 6000 },
  { cmd: '/bin/busybox lsmod 2>/dev/null | /bin/busybox grep -i motor', waitMs: 6000 },
  { cmd: 'dmesg 2>/dev/null | /bin/busybox grep -i motor | sed -n "1,120p"', waitMs: 12000 },
  { cmd: 'ls -la /lib/modules 2>/dev/null | /bin/busybox grep -i motor', waitMs: 6000 },
  { cmd: 'find /lib/modules -maxdepth 1 -type f 2>/dev/null | /bin/busybox grep -i motor', waitMs: 12000 },
  { cmd: 'ls -la /etc/init.d/load.sh 2>/dev/null', waitMs: 6000 },
  { cmd: 'grep -n -i motor /etc/init.d/load.sh 2>/dev/null | sed -n "1,120p"', waitMs: 12000 },
  { cmd: 'sed -n "200,280p" /etc/init.d/load.sh 2>/dev/null', waitMs: 12000 },
  { cmd: 'find / -maxdepth 5 -type f -name "*.cgi" 2>/dev/null', waitMs: 20000 },
  { cmd: 'find /app /etc /bin /sbin /usr -maxdepth 5 -type f 2>/dev/null | /bin/busybox grep -i -m 200 -e ptz -e motor -e servo -e decoder -e cgi 2>/dev/null', waitMs: 20000 },
  { cmd: 'find /app /etc /bin /sbin /usr -maxdepth 5 -type d 2>/dev/null | /bin/busybox grep -i -m 200 -e ptz -e motor -e servo -e decoder -e cgi 2>/dev/null', waitMs: 20000 },
  { cmd: '/bin/busybox netstat -anp 2>/dev/null | sed -n "1,200p"', waitMs: 12000 },
  { cmd: '/bin/busybox lsof 2>/dev/null | sed -n "1,200p"', waitMs: 20000 },
  { cmd: '/bin/busybox lsof 2>/dev/null | /bin/busybox grep -i -e motor -e 12345 -e 12346 -e 8080 | sed -n "1,120p"', waitMs: 20000 },
  { cmd: 'cat /proc/net/tcp 2>/dev/null', waitMs: 6000 },
  { cmd: 'cat /proc/net/udp 2>/dev/null', waitMs: 6000 },
  { cmd: 'ls -la /proc/jz 2>/dev/null', waitMs: 6000 },
  { cmd: 'grep -a -i -m 80 -e "/dev/motor" -e motor -e ptz -e servo -e decoder -e cgi /app/t23prj 2>/dev/null', waitMs: 20000 },
  { cmd: 'grep -r -n -i -m 200 -e motor -e ptz -e servo -e decoder /etc 2>/dev/null', waitMs: 20000 },
];

function printSection(title) {
  process.stdout.write(`\n===== ${title} =====\n`);
}

function clipText(text, max = 16000) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n... (truncated ${s.length - max} chars) ...\n`;
}

async function main() {
  const telnet = new CloseLiTelnet(CAMERA_IP);
  try {
    await telnet.connect();
    for (const { cmd, waitMs } of COMMANDS) {
      printSection(cmd);
      const out = await telnet.cmd(cmd, waitMs);
      process.stdout.write(clipText(out));
    }
  } finally {
    telnet.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
