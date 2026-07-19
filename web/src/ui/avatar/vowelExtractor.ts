/**
 * Multi-Language Phonological Vowel and Syllable Extractor.
 * Translates letters of typed/spoken text into phoneme targets in real-time.
 * Compatible with Indonesian, English, Japanese, and standard phonetic vowels.
 */
export const getActiveVowel = (text: string): 'a'|'i'|'u'|'e'|'o'|'consonant'|'pause' => {
  if (!text || text.trim().length === 0) return 'pause';
  
  const clean = text.trim();
  const lastChar = clean[clean.length - 1].toLowerCase();
  
  if ([' ', '.', ',', '?', '!', '-', '…', '"', "'", ':', ';', '(', ')'].includes(lastChar)) {
    return 'pause';
  }
  
  if (['a', 'á', 'à', 'â', 'ã', 'ä'].includes(lastChar)) return 'a';
  if (['i', 'í', 'ì', 'î', 'ï', 'y'].includes(lastChar)) return 'i';
  if (['u', 'ú', 'ù', 'û', 'ü', 'w'].includes(lastChar)) return 'u';
  if (['e', 'é', 'è', 'ê', 'ë'].includes(lastChar)) return 'e';
  if (['o', 'ó', 'ò', 'ô', 'õ', 'ö'].includes(lastChar)) return 'o';
  
  // Backward-scanning syllable tracker: identifies preceding vowel if last char is a consonant (like 'kan' -> 'a')
  for (let i = clean.length - 1; i >= 0; i--) {
     const char = clean[i].toLowerCase();
     if (['a', 'á', 'à', 'â', 'ã', 'ä'].includes(char)) return 'a';
     if (['i', 'í', 'ì', 'î', 'ï', 'y'].includes(char)) return 'i';
     if (['u', 'ú', 'ù', 'û', 'ü', 'w'].includes(char)) return 'u';
     if (['e', 'é', 'è', 'ê', 'ë'].includes(char)) return 'e';
     if (['o', 'ó', 'ò', 'ô', 'õ', 'ö'].includes(char)) return 'o';
     if ([' ', '.', ',', '?', '!', '-', '…', ':', ';'].includes(char)) break; // Boundary hit
  }
  
  return 'consonant';
};
