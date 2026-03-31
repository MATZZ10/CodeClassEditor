const ANSI_ESCAPE = /\u001b\[[0-9;]*m/g;

const RULES: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /expected ['"]?;['"]? before/i,
    message: "Cek lagi, ada titik koma (;) yang ketinggalan di baris sebelumnya.",
  },
  {
    pattern: /was not declared in this scope/i,
    message: "Variabel ini belum kamu buat atau ada salah ketik (typo).",
  },
  {
    pattern: /main\s+must\s+return\s+int/i,
    message: "Fungsi main harus pakai int dan diakhiri return 0; ya!",
  },
  {
    pattern: /ISO C\+\+ forbids declaration of 'main'/i,
    message: "Fungsi main harus bertipe int. Jangan pakai tipe aneh di main.",
  },
  {
    pattern: /expected ['"]?}['"]? before/i,
    message: "Ada kurung kurawal } yang belum ditutup.",
  },
  {
    pattern: /expected ['"]?\(['"]? before/i,
    message: "Ada kurung buka ( yang belum punya pasangan.",
  },
  {
    pattern: /undefined reference to/i,
    message: "Kodenya lolos compile, tapi gagal linking. Cek apakah fungsi atau file yang dipanggil memang ada.",
  },
  {
    pattern: /no matching function for call to/i,
    message: "Argumen fungsi tidak cocok dengan parameter yang diminta.",
  },
  {
    pattern: /redefinition of/i,
    message: "Nama variabel atau fungsi dipakai dua kali. Ganti salah satunya.",
  },
  {
    pattern: /invalid conversion/i,
    message: "Ada tipe data yang tidak cocok. Cek cast atau tipe variabelnya.",
  },
  {
    pattern: /expected initializer before/i,
    message: "Deklarasi di atas baris ini belum selesai atau ada syntax yang rusak.",
  },
  {
    pattern: /stray ['"]?\\['"]? in program/i,
    message: "Ada karakter backslash atau escape sequence yang tidak semestinya di kode.",
  },
  {
    pattern: /missing terminating ['"] character/i,
    message: "Ada string yang belum ditutup dengan tanda kutip.",
  },
];

function stripAnsi(text: string) {
  return text.replace(ANSI_ESCAPE, "");
}

export function diagnoseCppError(stderr: string) {
  const clean = stripAnsi(stderr ?? "").trim();

  if (!clean) {
    return "Tidak ada pesan error dari compiler.";
  }

  const lines = clean
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        return rule.message;
      }
    }
  }

  const fallback =
    lines.find((line) => /error:|fatal error:|undefined reference|ld returned/i.test(line)) ??
    lines[0] ??
    clean;

  return `Compiler menolak kode ini. ${fallback}`;
}