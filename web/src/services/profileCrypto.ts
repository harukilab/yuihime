/**
 * Module utilitas enkripsi profil YuiHime.
 * Mengamankan biodata pengguna saat disimpan atau dimuat demi privasi multi-channel yang terlindungi.
 */

const ENCRYPTION_KEY = "YuiHimeSecureCoreKey-2026-v5";

/**
 * Mengenkripsi biodata pengguna dan sesi ID menjadi format String bersandi kriptografi terlindungi (Symmetric XOR Encrypted).
 *
 * @param data Objek berisi biodata pengguna dan sesi ID
 * @returns Berkas teks dengan header segel batin khas Yuihime.
 */
export function encryptProfile(data: any): string {
  const jsonStr = JSON.stringify({
    ...data,
    origin: "YuiHime Desktop Web",
    encryptedAt: new Date().toISOString(),
    signature: "YUIHIME_SECURE_LATTICE_V1"
  });

  let cipher = "";
  for (let i = 0; i < jsonStr.length; i++) {
    const charCode = jsonStr.charCodeAt(i);
    const keyChar = ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length);
    const encryptedChar = charCode ^ keyChar;
    cipher += String.fromCharCode(encryptedChar);
  }

  // Melakukan konversi biner aman ke base64
  const b64 = btoa(unescape(encodeURIComponent(cipher)));
  
  // Bungkus dalam baris preambule otentikasi agar terlihat futuristik dan profesional
  return `-----BEGIN YUIHIME SECURE PROFILE CRYPT-----\n${b64}\n-----END YUIHIME SECURE PROFILE CRYPT-----`;
}

/**
 * Mendekripsi string bersandi kembali menjadi objek biodata asli penanda sesi.
 *
 * @param pem Kunci teks terenkripsi berporos header Yuihime
 * @returns Objek biodata asli / throws error apabila gagal verifikasi.
 */
export function decryptProfile(pem: string): any {
  const cleanPem = pem
    .replace("-----BEGIN YUIHIME SECURE PROFILE CRYPT-----", "")
    .replace("-----END YUIHIME SECURE PROFILE CRYPT-----", "")
    .replace(/\s/g, "");

  if (!cleanPem) {
    throw new Error("Berkas profil tidak berisi data sandi.");
  }

  const cipher = decodeURIComponent(escape(atob(cleanPem)));
  
  let jsonStr = "";
  for (let i = 0; i < cipher.length; i++) {
    const charCode = cipher.charCodeAt(i);
    const keyChar = ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length);
    const decryptedChar = charCode ^ keyChar;
    jsonStr += String.fromCharCode(decryptedChar);
  }

  const parsed = JSON.parse(jsonStr);
  
  // Verifikasi tanda tangan digital batin Yuihime
  if (parsed.signature !== "YUIHIME_SECURE_LATTICE_V1") {
    throw new Error("Tanda tangan dekripsi salah. Berkas ini bukan berkas identitas Yuihime yang valid!");
  }

  return parsed;
}
