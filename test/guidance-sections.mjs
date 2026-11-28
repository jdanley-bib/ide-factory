/** The text from a level-2 heading to the next level-2 heading or the ownership marker. */
export function extractSection(text, heading) {
  const start = text.indexOf(`${heading}\n`);
  if (start < 0) return null;
  const rest = text.slice(start + heading.length);
  const end = rest.search(/^## |^<!-- idefactory:owned -->/m);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

/** The files whose section under `heading` differs from the first file's section, or is missing. */
export function driftedSections(files, heading) {
  const [reference, ...others] = files;
  const expected = extractSection(reference.text, heading);
  const drifted = [];
  if (expected === null) drifted.push(reference.name);
  for (const file of others) {
    if (extractSection(file.text, heading) !== expected) drifted.push(file.name);
  }
  return drifted;
}
