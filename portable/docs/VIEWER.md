# Common portable viewer

## Default experience

All `impact view` and `src/server.mjs` inspection entry points use the same
Code / Graph / Tests assets. The graph is the initial view. Positions remain
stable while framing, searching, selecting, panning or zooming. The minimap
moves the viewport; camera and selection state are stored in the URL.
The node table offers a paginated keyboard alternative.

Selecting a node shows its recorded source. Selecting an edge shows source
located by its evidence. Previews render at most 80 lines, with numbered lines,
range highlighting when recorded, a location selector and Open source in Code.
For the original inspection format, source bytes must be archived explicitly
through `import-v2 --include-sources`. They retain their unverified inspection
status. Missing locators, ranges or contents never become inferred code.

Inspection has no native test catalogue, baseline or actual execution receipts;
Tests and other workspace views expose only records supplied by the model.
The viewer never runs tests or changes selection authority.

## Distribution

The presentation sources live in `ui/browser` and `src/viewer`. The compiled
`ui/dist` and `lib` folders ship with the package and standalone exporter.
The public viewer adapter accepts the common presentation workspace; existing
CLI commands retain the original inspection format and command set.
The generic HTML export API uses the same compiled UI, embedding only supplied
presentation data. Previously exported HTML must be regenerated after updates.

No project onboarding profiles, development measurements, CI handoffs or
project-specific evidence belong in this distribution.

## Rebuild

Use explicit installed tool directories; consuming the precompiled distribution
requires neither tool:

```sh
node scripts/buildViewerBackend.ts /path/to/typescript-5.9.3
node scripts/buildViewer.ts /path/to/vite-8.2.2
```

The UI uses TypeScript, CSS Modules and a vendored semantic dark palette.
No framework, CDN or project service is needed at runtime. Updated scale,
offline and accessibility acceptance are pending; no other project's reports
are imported as acceptance evidence. No test suite was run for this update.
