// Test calibration extraction
const content = `**Compared to shows you may know**
*   Heat → If Heat felt like a professional rivalry between masters of their craft, The Dark Knight feels like a collision between a machine and an arsonist.
*   The Batman (2022) → If The Batman felt like a grounded detective noir, The Dark Knight feels like an ideological war fought on a city-wide scale.
*   Seven → If Seven felt like a slow descent into a basement, The Dark Knight feels like being trapped in a falling elevator.

If The Batman felt like a rainy walk through a crime scene, The Dark Knight feels like the ringing in your ears after an explosion.

**Worth knowing**`;

function extractCalibrationSentence(cardContent) {
  const lines = cardContent.split('\n');
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('-') || (trimmedLine.startsWith('*') && !trimmedLine.startsWith('*If'))) continue;
    if (trimmedLine.includes('→') || trimmedLine.includes('->')) continue;
    const patterns = [
      /^\*?If\s+\*?([^*,]+?)\*?\s+felt\s+(like\s+)?(.+?),\s+this\s+((?:may\s+)?feel[s]?\s+(?:like\s+)?.+?)\.?\*?$/i,
      /^\*?If\s+\*?([^*,]+?)\*?\s+felt\s+(like\s+)?(.+?),\s+([A-Z][A-Za-z0-9\s':]+?)\s+((?:may\s+)?feel[s]?\s+(?:like\s+)?.+?)\.?\*?$/i,
    ];
    for (const pattern of patterns) {
      const match = trimmedLine.match(pattern);
      if (match) {
        console.log('Match found:', match);
        if (match.length === 5) {
          const [, title, likeWord, feltPart, feelsPart] = match;
          const feltPrefix = likeWord ? 'like ' : '';
          return `If ${title.trim()} felt ${feltPrefix}${feltPart.trim()}, this ${feelsPart.replace(/\.+$/, '').trim()}.`;
        } else if (match.length === 6) {
          const [, title, likeWord, feltPart, , feelsPart] = match;
          const feltPrefix = likeWord ? 'like ' : '';
          return `If ${title.trim()} felt ${feltPrefix}${feltPart.trim()}, this ${feelsPart.replace(/\.+$/, '').trim()}.`;
        }
      }
    }
  }
  return null;
}

console.log('Result:', extractCalibrationSentence(content));
