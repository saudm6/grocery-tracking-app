export type RetailFormat = 'upc_a' | 'upc_e' | 'ean8' | 'ean13';
export type CodeFormat = RetailFormat | 'qr';
export type CodeInput = { format: CodeFormat; value: string };
export type NormalizedCode =
  | { namespace: 'retail'; format: RetailFormat; original: string; key: string }
  | { namespace: 'qr'; format: 'qr'; original: string; key: string };

export function normalizeCode(input: CodeInput): NormalizedCode {
  if (typeof input?.value !== 'string') throw new Error('Enter a code and choose its format.');
  const { format, value } = input;
  if (format === 'qr') {
    let bytes = 0;
    for (const character of value) {
      const point = character.codePointAt(0)!;
      if (point >= 0xd800 && point <= 0xdfff) throw new Error('QR content must be well-formed Unicode.');
      bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    }
    if (bytes === 0 || bytes > 4096) throw new Error('QR content must contain 1 to 4,096 UTF-8 bytes.');
    return { namespace: 'qr', format, original: value, key: value };
  }
  if (format !== 'upc_a' && format !== 'upc_e' && format !== 'ean8' && format !== 'ean13') throw new Error('Choose UPC-A, UPC-E, EAN-8, EAN-13, or QR.');
  const length = format === 'upc_a' ? 12 : format === 'ean13' ? 13 : 8;
  if (!/^[0-9]+$/.test(value) || value.length !== length) throw new Error(`This format needs exactly ${length} digits, including its check digit.`);
  let retail = value;
  if (format === 'upc_e') {
    const [system, a, b, c, d, e, f, check] = value;
    if (system !== '0' && system !== '1') throw new Error('UPC-E number system must be 0 or 1.');
    const payload = f <= '2' ? `${system}${a}${b}${f}0000${c}${d}${e}`
      : f === '3' ? `${system}${a}${b}${c}00000${d}${e}`
        : f === '4' ? `${system}${a}${b}${c}${d}00000${e}`
          : `${system}${a}${b}${c}${d}${e}0000${f}`;
    retail = payload + check;
  }
  let sum = 0;
  for (let position = retail.length - 2, weight = 3; position >= 0; position--, weight = 4 - weight) sum += Number(retail[position]) * weight;
  if ((10 - sum % 10) % 10 !== Number(retail.at(-1))) throw new Error('The code check digit is invalid.');
  return { namespace: 'retail', format, original: value, key: retail.padStart(14, '0') };
}
