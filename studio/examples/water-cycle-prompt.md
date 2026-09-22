# Text-to-image occlusion experiment

Created with the built-in image generation tool on 2026-09-17. No user API key was used. API pricing for this image has **not** been measured; it is not included in the prototype's paid generation path. Loading the bundled example costs nothing.

Source text:

> Evaporation converts liquid water into water vapour. Condensation converts water vapour into liquid droplets. Precipitation is water falling from clouds as rain, snow, sleet, or hail. Solar energy drives evaporation.

Exact generation prompt:

```text
Use case: scientific-educational. Create one polished landscape educational diagram for Anki image occlusion, 1536x1024 if possible. Topic: water cycle. Source facts ONLY: Evaporation converts liquid water into water vapour. Condensation converts water vapour into liquid droplets. Precipitation is water falling from clouds as rain, snow, sleet, or hail. Solar energy drives evaporation. Draw a tasteful clean flat illustrated landscape with sun upper left, lake lower left, cloud upper center, hills lower right. Show rising arrow from lake to cloud, droplets forming in cloud, falling rain arrow toward hills. Three separate high contrast white rectangular label plaques in generous whitespace, connected to corresponding process with a fine leader. Text exactly: 'Evaporation', 'Condensation', 'Precipitation', each appears only once. Place Evaporation at left-middle, Condensation at top-center, Precipitation at right-middle. All three plaques equal height, large readable dark sans-serif text, at least 24 pixels whitespace around each text. No other text anywhere, no title, no legend, no duplicates, no watermark. Precise uncluttered educational composition with sea teal, warm ochre sunlight, sage green land, off-white backdrop. Plaques will later be covered with rectangular masks, so keep each entire answer inside its plaque. Do not draw masks yourself.
```

Observations: all three labels are readable and appear once. The illustration is more painterly than the requested flat style, but the separate answer plaques make occlusion straightforward. Evaporation, condensation, and precipitation are positioned coherently. This is a schematic teaching illustration, not a literal depiction of droplet size. Mask rectangles were measured after generation; prompt-specified layout alone is not accurate enough to derive final coordinates.

Reproduce the experiment in the app with **Try the AI-illustrated example**. Three masks and three cloze notes are included. The image, original SVG masks, question masks and answer masks are bundled in the exported Anki deck.

For further experiments, replace the source facts and exact labels with a short, verified excerpt. Ask for separate label plaques, no repeated answers, no answer text in a legend, and enough room to cover each label. Upload the result and draw masks, or use the app's AI mode to suggest them. Always inspect generated diagrams for factual errors before learning from them.
