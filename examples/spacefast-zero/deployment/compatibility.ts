import { deserialize, serialize } from "@ungap/structured-clone";

/** The Spec/Kernel's data cloning semantics, supplied only to the optional Zero server bundle. */
export const cloneData = <T>(value: T): T => deserialize(serialize(value)) as T;

/** UTF-8 encoding required for checkpoint byte budgets; no host globals are patched. */
export class Utf8Encoder {
  readonly encoding = "utf-8";
  encode(value = ""): Uint8Array {
    const bytes: number[] = [];
    for (const character of String(value)) {
      let point = character.codePointAt(0)!;
      if (point >= 0xd800 && point <= 0xdfff) point = 0xfffd;
      if (point < 0x80) bytes.push(point);
      else if (point < 0x800) bytes.push(0xc0 | (point >> 6), 0x80 | (point & 63));
      else if (point < 0x10000)
        bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 63), 0x80 | (point & 63));
      else
        bytes.push(
          0xf0 | (point >> 18),
          0x80 | ((point >> 12) & 63),
          0x80 | ((point >> 6) & 63),
          0x80 | (point & 63),
        );
    }
    return Uint8Array.from(bytes);
  }
}
