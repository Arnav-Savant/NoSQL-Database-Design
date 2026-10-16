const LINE_WIDTH = 78;

/** Prints chapter headings, explanations and operations in a consistent shape. */
export class Narrator {
  #output;

  constructor(output = (line) => process.stdout.write(`${line}\n`)) {
    this.#output = output;
  }

  chapter(number, title, paragraphs) {
    this.#output('');
    this.#output(`== Chapter ${number}: ${title} ==`);
    this.explain(paragraphs);
  }

  explain(paragraphs) {
    for (const paragraph of paragraphs) {
      this.#output('');
      for (const line of wrap(paragraph, LINE_WIDTH)) this.#output(line);
    }
  }

  operation(description) {
    this.#output('');
    this.#output(`> ${description}`);
  }

  result(text) {
    this.#output(`  result: ${text}`);
  }

  line(text = '') {
    this.#output(text);
  }
}

function wrap(text, width) {
  const lines = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    if (current.length > 0 && current.length + 1 + word.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = current.length > 0 ? `${current} ${word}` : word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}
