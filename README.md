# PDF Tools

17 PDF & image tools that run entirely in the browser — no backend, no
upload, no login. Files never leave the device.

Merge, Split/Extract, Organize (reorder/rotate/delete), Remove pages,
Rotate, Reverse, N-up, Resize to A4, Remove blank pages, Images → PDF,
Scan document (camera), PDF → Images, Compress PDF, Compress images,
Watermark, Page numbers, Remove metadata.

Built with Next.js, [pdf-lib](https://pdf-lib.js.org/) and
[pdfjs-dist](https://mozilla.github.io/pdf.js/).

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy

Any static/Node host that runs Next.js works (e.g. Vercel — import this
repo and deploy, no configuration needed).

`pdfjs-dist` is pinned to an exact version in `package.json` — a newer
patch release has broken headless/older-browser compatibility before, so
don't relax that to a caret range without re-testing.
