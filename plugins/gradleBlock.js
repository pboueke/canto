function findNamedBlock(contents, blockName, searchStart = 0, searchEnd = contents.length) {
  const matches = [];
  let candidate = contents.indexOf(blockName, searchStart);
  while (candidate !== -1 && candidate < searchEnd) {
    const previous = candidate === 0 ? '' : contents[candidate - 1];
    let cursor = candidate + blockName.length;
    while (cursor < searchEnd && /\s/.test(contents[cursor])) cursor += 1;
    const hasWordBoundary = previous === '' || !/[A-Za-z0-9_]/.test(previous);
    if (hasWordBoundary && contents[cursor] === '{') matches.push(candidate);
    candidate = contents.indexOf(blockName, candidate + blockName.length);
  }

  if (matches.length !== 1) {
    throw new Error(`expected exactly one ${blockName} block, found ${matches.length}`);
  }

  const start = matches[0];
  const openBrace = contents.indexOf('{', start);
  let depth = 0;
  for (let index = openBrace; index < searchEnd; index += 1) {
    if (contents[index] === '{') depth += 1;
    if (contents[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return { start, openBrace, end: index + 1 };
      }
    }
  }

  throw new Error(`expected a complete ${blockName} block`);
}

function findReleaseBuildType(contents) {
  let buildTypes;
  try {
    buildTypes = findNamedBlock(contents, 'buildTypes');
    return findNamedBlock(contents, 'release', buildTypes.openBrace + 1, buildTypes.end - 1);
  } catch (error) {
    throw new Error(`Unable to locate Android release buildType: ${error.message}`);
  }
}

module.exports = { findNamedBlock, findReleaseBuildType };
