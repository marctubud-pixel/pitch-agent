// Project files are kept as written. These helpers only project their labelled text into the stage sheet.
export type Row = { label: string; value: string };
export type Section = { heading: string; lines: string[] };

export function plain(line: string) {
  return line
    .trim()
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^[-*+]\s+/, '')
    .trim();
}

export function sectionsOf(text: string) {
  const sections: Section[] = [{ heading: '', lines: [] }];
  for (const raw of text.split(/\r?\n/)) {
    const heading = raw.trim().match(/^#{1,6}\s+(.+)/);
    if (heading) sections.push({ heading: plain(heading[1]), lines: [] });
    else if (raw.trim()) sections[sections.length - 1].lines.push(plain(raw));
  }
  return sections;
}

export function rowOf(line: string): Row | undefined {
  if (line.startsWith('|')) {
    const cells = line
      .replace(/^\||\|$/g, '')
      .split('|')
      .map(plain);
    if (
      cells.length === 2 &&
      cells.every(Boolean) &&
      !/^[-: ]+$/.test(cells[0]) &&
      !['字段', '项目', '项目字段', '项目要素', '信息项'].includes(cells[0])
    ) {
      return { label: cells[0], value: cells[1] };
    }
  }
  const pair = line.match(/^([^：:|。！？]{1,18})[：:]\s*(.+)$/u);
  return pair ? { label: pair[1], value: pair[2] } : undefined;
}

export function firstStatement(lines: string[]) {
  return lines.find((line) => !line.startsWith('|') && !line.startsWith('<')) || '';
}

export function directionBody(sections: Section[], name: string, ordinal: number) {
  const tags =
    [
      ['一', '1', 'A'],
      ['二', '2', 'B'],
      ['三', '3', 'C'],
    ][ordinal] || [];
  const start = sections.findIndex(
    (section) =>
      section.heading === name ||
      (section.heading.includes(name) && /方向|创意|方案|主题/.test(section.heading)),
  );
  const index =
    start >= 0
      ? start
      : sections.findIndex((section) =>
          tags.some((tag) =>
            new RegExp('^(?:创意)?(?:方向|方案)\\s*' + tag + '(?:[\\s：:、.｜|]|$)', 'i').test(
              section.heading,
            ),
          ),
        );
  return index >= 0 ? sections[index] : undefined;
}
