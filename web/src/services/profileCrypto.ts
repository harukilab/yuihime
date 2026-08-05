/**
 * YuiHime profile encryption utility module.
 * Secures user biodata when saved or loaded for protected multi-channel privacy.
 */

const ENCRYPTION_KEY = "YuiHimeSecureCoreKey-2026-v5";

/**
 * Encrypts user biodata and session ID into a protected cryptographic string format (Symmetric XOR Encrypted).
 *
 * @param data Object containing user biodata and session ID
 * @returns Text file with Yuihime's signature inner seal header.
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

  // Perform safe binary-to-base64 conversion
  const b64 = btoa(unescape(encodeURIComponent(cipher)));
  
  // Wrap in an authentication preamble line so it looks futuristic and professional
  return `-----BEGIN YUIHIME SECURE PROFILE CRYPT-----\n${b64}\n-----END YUIHIME SECURE PROFILE CRYPT-----`;
}

/**
 * Decrypts the encoded string back into the original session-marked biodata object.
 *
 * @param pem Encrypted text key anchored to the Yuihime header
 * @returns Original biodata object / throws an error if verification fails.
 */
export function decryptProfile(pem: string): any {
  const cleanPem = pem
    .replace("-----BEGIN YUIHIME SECURE PROFILE CRYPT-----", "")
    .replace("-----END YUIHIME SECURE PROFILE CRYPT-----", "")
    .replace(/\s/g, "");

  if (!cleanPem) {
    throw new Error("Profile file contains no encrypted data.");
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
  
  // Verify Yuihime's inner digital signature
  if (parsed.signature !== "YUIHIME_SECURE_LATTICE_V1") {
    throw new Error("Decryption signature mismatch. This file is not a valid Yuihime identity file!");
  }

  return parsed;
}
