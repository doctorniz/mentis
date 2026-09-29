import { Marp } from '@marp-team/marp-core'

export interface SlidesRender {
  html: string
  css: string
}

const marp = new Marp({
  math: { lib: 'katex', katexFontPath: false },
  script: false,
})

export function renderSlides(source: string): SlidesRender {
  const { html, css } = marp.render(source)
  return { html, css }
}
