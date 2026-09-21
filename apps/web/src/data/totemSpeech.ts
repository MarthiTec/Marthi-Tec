export function stopTotemSpeech() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}

export function speakTotem(text: string, enabled: boolean) {
  if (!enabled || typeof window === 'undefined' || !window.speechSynthesis) return;
  const phrase = text.trim();
  if (!phrase) return;
  stopTotemSpeech();
  const utterance = new SpeechSynthesisUtterance(phrase);
  utterance.lang = 'pt-BR';
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}
