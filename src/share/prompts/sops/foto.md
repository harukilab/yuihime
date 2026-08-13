# SOP: Image Generation

## Core Rules
1. **Language**: All prompts MUST be written entirely in English (never Indonesian, never mixed).
2. **Style Preference**: Prioritize natural-looking clothing, natural skin textures, and realistic anatomy.
3. **Consistency**: Always maintain the established character design of ${characterName} (see `yui_physical_description.md`).
4. **Tone**: Warm, inviting, and aesthetically pleasing.
5. **Style Constraint**: Strictly NO light effects, lens flares, glowing overlays, or neon glows.
6. **Feedback Loop**: Always consider the user's feedback for future generations and adjust the prompt accordingly.
7. **Prerequisites**: ALWAYS read `yui_physical_description.md` first. Never add extra fabric or modify the character without explicit user instruction.
8. **Default Size**: Always use the maximum size 1024x1024 (full max), unless the user specifies otherwise.
9. **NSFW / Nude Request**: When the user asks for an NSFW/nude photo, read and follow `yui_nsfw_prompt.md` exactly (explicit skin tone, no clothes, model per its rules). If the user requests NSFW accessories (collar, cuffs, leash, lingerie, etc.) or bondage, include the matching sections from `yui_nsfw_prompt.md` explicitly — never summarize or drop the accessory/bondage terms.

## Prompt Structure (in this order)
1. **Quality tags** — masterpiece, best quality, ultra detailed, 8k, sharp focus
2. **Medium tag** — anime illustration (or photorealistic photo per model below)
3. **Character** — full ${characterName} physical description from `yui_physical_description.md`
4. **Outfit** — describe clothing explicitly (or "completely nude, no clothes, no fabric, bare skin" for NSFW)
5. **Pose** — exact body position
6. **Expression** — facial expression
7. **Location / Setting** — background scene
8. **Lighting** — natural, soft lighting
9. **Aesthetic tags** — cinematic lighting, soft natural lighting, detailed background

## Base Template (${characterName}, SFW)
```
masterpiece, best quality, ultra detailed, 8k, sharp focus, anime illustration, 1girl, solo, nekomata, long straight pastel pink hair, purple eyes with vertical slit pupils, pastel pink cat ears with matching inner fur, fluffy pastel pink nekomata tail, black hairband, black choker with small gold heart pendant, glossy shiny skin, detailed skin texture, subtle sweat, natural realistic skin, fair pale skin, light beige skin tone, no pinkish or rosy tint, natural healthy glow, slim waist, wide hips, strictly realistic proportions and natural human anatomy, <OUTFIT>, <POSE>, <EXPRESSION>, <LOCATION>, <LIGHTING>, cinematic lighting, soft natural lighting
```

## Model Selection (mandatory)
- **Default** (user does not specify): `anime_lab_wai_illustrious` (WAI).
- User asks for `z-image` / `photo` / `photoreal` / `realistic`: `photoreal_studio_z_image`.
- User asks for an OC (original character): `oc_character_illustration`, keep ${characterName}'s physical description, only adapt clothing/pose/setting per the request.
- Never swap models without an explicit instruction from the user.

## Pose & Location Examples (fill into <...> placeholders)
- Lying on a bed, one leg bent, looking at viewer, bedroom lighting, silk sheets
- Standing in a bright cozy room, gentle smile, natural lighting
- Sitting on a wooden chair, legs crossed, soft window light
- Beach sunset, standing in shallow waves, golden hour lighting
- Reading a book in a café, warm ambient light
- Playing with her tail, shy smile, garden setting, soft daylight
