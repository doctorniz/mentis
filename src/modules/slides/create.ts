/** A starter deck: front-matter directives, a title slide and a slide with math. */
export default function createSlides({ title }: { title: string }): string {
  return `---
marp: true
title: "${title}"
paginate: true
math: katex
---

# ${title}

---

## Next slide

- One point per line
- Inline math: $e^{i\\pi} + 1 = 0$

$$
\\int_0^1 x^2 \\, dx = \\frac{1}{3}
$$
`
}
