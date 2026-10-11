import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/**
 * QR code drawn as a React SVG element (no innerHTML and no data: URL, so the CSP stays strict).
 * Used only to show the authenticator-app setup link on the user's own screen.
 */
export function QrCode({ value, size = 200, label }: { value: string; size?: number; label: string }) {
  const { path, modules } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = '';
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`;
      }
    }
    return { path: d, modules: count + 8 };
  }, [value]);

  return (
    <svg
      className="qr-code"
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${modules} ${modules}`}
      shapeRendering="crispEdges"
    >
      <rect width={modules} height={modules} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
