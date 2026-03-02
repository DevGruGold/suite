---
name: storyboard-creation
description: Create professional AI-powered storyboards for marketing campaigns, social media content, product demos, and brand storytelling using Imagen 3.
---

# Storyboard Creation Skill

Use this skill to create professional visual storyboards for **marketing campaigns**, **social media videos**, **product demos**, and **brand storytelling**.

## When to Use

- User requests a storyboard, shot list, video plan, or visual narrative
- Planning a marketing video, Instagram Reel, TikTok, or ad campaign
- Creating educational or tutorial visual sequences
- Brand storytelling or promotional content

## Function: `storyboard-creation`

Call `invoke_edge_function('storyboard-creation', { action, ...params })`.

---

## Actions

### `create_storyboard` — Full pipeline (recommended)

Generates all panels and returns the complete board.

```json
{
  "action": "create_storyboard",
  "title": "Party Favor Photo Spring Campaign",
  "style": "cinematic",
  "aspect_ratio": "16:9",
  "layout": "2x3",
  "brand_context": "Photo booth company, fun colorful events, DFW Texas market",
  "session_id": "<session_id>",
  "shots": [
    {
      "shot_number": 1,
      "description": "Couple laughing at photo booth, props in hand",
      "shot_type": "MS",
      "camera_angle": "eye_level",
      "camera_movement": "static",
      "duration_sec": 3,
      "dialogue": "Strike a pose!",
      "notes": "Warm evening lighting"
    }
  ]
}
```

### `generate_panel` — Single panel

For regenerating or previewing one panel.

```json
{
  "action": "generate_panel",
  "style": "cinematic",
  "aspect_ratio": "16:9",
  "brand_context": "...",
  "shot": { "shot_number": 1, "description": "...", "shot_type": "CU" }
}
```

### `list_storyboards` / `get_storyboard` / `delete_storyboard`

```json
{ "action": "list_storyboards", "session_id": "..." }
{ "action": "get_storyboard",   "storyboard_id": "..." }
{ "action": "delete_storyboard","storyboard_id": "..." }
```

---

## Shot Types

| Code | Description |
|------|-------------|
| ECU  | Extreme Close-Up — single detail (eye, logo, product) |
| CU   | Close-Up — face or key object fills frame |
| MCU  | Medium Close-Up — chest up, intimate |
| MS   | Medium Shot — waist up, conversational |
| MLS  | Medium Long Shot — knees up |
| LS   | Long Shot — full body in environment |
| WS   | Wide Shot — wide environment, subject small |
| EWS  | Extreme Wide Shot — vast landscape |

## Camera Angles

`eye_level` · `high_angle` · `low_angle` · `birds_eye` · `worms_eye` · `dutch_angle` · `over_the_shoulder` · `static`

## Camera Movements

`pan` · `tilt` · `dolly` · `truck` · `crane_jib` · `zoom` · `steadicam` · `handheld` · `static`

## Styles

`cinematic` · `photorealistic` · `illustration` · `sketch`

## Aspect Ratios

`16:9` (landscape/YouTube) · `9:16` (TikTok/Reels) · `1:1` (Instagram) · `4:3` (classic)

## Layouts

`2x3` (6 panels) · `3x3` (9 panels) · `2x2` (4 panels) · `single` (1 panel)

---

## Workflow

1. **Gather brief**: ask for topic, brand, platform, and mood
2. **Draft shot list**: suggest 4–6 shots covering intro → action → CTA
3. **Call `create_storyboard`** with all shots
4. **Present results**: describe each panel, share the storyboard JSON
5. **Iterate**: offer to regenerate individual panels or adjust style

## Continuity Rules (apply automatically)

- **180-Degree Rule**: keep camera on one side of the action axis
- **Match on Action**: cut mid-motion for smooth transitions
- **Screen Direction**: maintain left/right consistency across cuts
- **Eyeline Match**: if character looks left, next shot shows what's to the left
